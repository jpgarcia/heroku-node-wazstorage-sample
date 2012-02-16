var express 		= require('express')
	, url			= require('url')
	, http 			= require('http')
	, azure			= require('azure')
	, fs			= require('fs')
	, uuid 			= require('node-uuid')
	, Seq 			= require('seq');

/*
 * Configuration
 * ---------------------------------------- */
var app = express.createServer(express.logger());

app.register('html', require('ejs'));

app.set('views', __dirname + '/views');
app.set('view engine', 'html');

app.enable("jsonp callback");

app.configure(function () {
	app.use(express.methodOverride());
	app.use(express.bodyParser());
	app.use(app.router);
	app.use(express.static(__dirname + '/static'));
});

var constants = {
	containerName			: 'node-sample-metrics',
	configurationBlobName	: 'configuration',
	readSampleBlobName		: 'readSampleBlobName' }

var blobClient;

function downloadBlobForReadingMetrics(readUrl, callback){
	Seq()
		.seq(function() {
			blobClient.createContainerIfNotExists(constants.containerName, this);
		})
		.seq(function(){
			var that = this;

			var source = url.parse(readUrl);
						
			http.request({ host: source.host, path: source.pathname }, function(response){
				that(null, response);
			}).end();
		})
		.seq(function(response){
			var length = response.headers['content-length'];						
			console.log('downloading blob: ' + length + ' bytes.');			
			blobClient.createBlockBlobFromStream(constants.containerName, constants.readSampleBlobName, response, length, this);
		})
		.seq(function(){
			app.configuration.readBlobDownloaded = true;
			storeConfiguration(app.configuration, callback);
		})
		.catch(function (err) {
    		callback(err.stack ? err.stack : err);
		});		
}

function retrieveConfiguration(callback){
	Seq()
		.seq(function() {
			blobClient.createContainerIfNotExists(constants.containerName, this);
		})
		.seq(function(){
			blobClient.getBlobToText(constants.containerName, constants.configurationBlobName, callback);
		})
		.catch(function (err) {
			console.log('ERRORRRR');
    		callback(err.stack ? err.stack : err);
		});
}

function storeConfiguration(configuration, callback){
	Seq()
		.seq(function() {	
			blobClient.createContainerIfNotExists(constants.containerName, this);
		})
		.seq(function(){
			blobClient.createBlockBlobFromText(constants.containerName, constants.configurationBlobName, JSON.stringify(configuration), callback);
		})
		.catch(function (err) {
    		callback(err.stack ? err.stack : err);
		});
}

/*
 * Middleware functions
 * ---------------------------------------- */
function checkEnvironmentConfiguration(req, res, next){
	if (process.env['WAZ_STORAGE_ACCOUNT_NAME'] && process.env['WAZ_STORAGE_ACCESS_KEY']) {
		if (!app.configuration) {			
			retrieveConfiguration(function (err, config) {
				if (err && err.code != 'BlobNotFound') {
					res.render('error', { error: err });
					return;
				}
				
				app.configuration = JSON.parse(config || '{"writeUrl": "", "readUrl": "", "herokuUrl": "", "wazUrl": "", "readBlobDownloaded" : "false"}');

				next();
				return;
			});
		} else {
			next();
			return;			
		}
	} else {
		res.render('error', { error: 'Missing storage configuration environment variables (WAZ_STORAGE_ACCOUNT_NAME & WAZ_STORAGE_ACCESS_KEY).'});
	}	
}


// function listBlobs(err, callback) {
// 	blobClient.listBlobs(constants.containerName, function(err, blobs) {
// 		for (var i=0; i<blobs.length; i++){
// 			blobClient.deleteBlob(constants.containerName, blob.Name, function(e, s){
// 				console.log(s);
// 			});				
// 		}
// 	}
// }


/*
 * Routes
 * ---------------------------------------- */
app.get('/', checkEnvironmentConfiguration, function (req, res) {
	res.render('index', { config: app.configuration });
});

app.get('/status', checkEnvironmentConfiguration, function (req, res) {
	res.send(200);
});

app.get('/test', checkEnvironmentConfiguration, function (req, res) {
	res.render('test', { config: app.configuration });
});

app.get('/config', checkEnvironmentConfiguration, function (req, res) {
	res.render('config', { config: app.configuration });
});

app.post('/config', checkEnvironmentConfiguration, function (req, res) {
	if (app.configuration.readUrl != req.body['read-url']) {
		app.configuration.readBlobDownloaded = false;
	}

	app.configuration.writeUrl = req.body['write-url'];
	app.configuration.readUrl = req.body['read-url']; 
	app.configuration.herokuUrl = req.body['heroku-url']; 
	app.configuration.wazUrl = req.body['waz-url'];

    Seq()
		.seq(function() {	
			storeConfiguration(app.configuration, this);
		})
		.seq(function(){
			// Starts the download process but not waiting, it will check in the home page 
			// whether the file is downloaded or not. by checking 'app.configuration.readBlobDownloaded'
			if (!app.configuration.readBlobDownloaded) {
				downloadBlobForReadingMetrics(app.configuration.readUrl, function() { /* foo */ });
			}

			res.redirect('/');
		})
		.catch(function (err) {
    		res.render('error', { error: err });
		});
});

app.delete('/blobs', function (req, res) {
});

app.get('/azure/blobs/write', function (req, res) {
	var start = new Date();

	Seq()
		.seq(function() {	
			blobClient.createContainerIfNotExists(constants.containerName, this);
		})
		.seq(function(){
			var that = this;
			var source = url.parse(app.configuration.writeUrl);

			// TODO: handle request errors
			http.request({ host: source.host, path: source.pathname }, function(response){
				that(null, response)
			}).end();
		})
		.seq(function(response){
			var length = response.headers['content-length'];
			var blobName = uuid.v4().replace(/-/g,'');

			blobClient.createBlockBlobFromStream(constants.containerName, blobName, response, length, this);
		})
		.seq(function(blockBlob, response) {
			var time = new Date() - start;
			res.send({ time: time});			
		})
		.catch(function (err) {
    		res.json({ err: err.toString() });
		});
});

app.get('/azure/blobs/read', function (req, res) {
	var start = new Date();

	Seq()
		.seq(function() {	
			blobClient.getBlobToText(constants.containerName, constants.readSampleBlobName, this);
		})
		.seq(function(response){
			var time = new Date() - start;
			res.send({ time: time});
		})
		.catch(function (err) {
    		res.json({ err: err.toString() });
		});
});

/*
 * Bootstrap
 * ---------------------------------------- */
var port = process.env.PORT || 3000;

app.listen(port, function () {
	try{
		blobClient = azure.createBlobService(process.env['WAZ_STORAGE_ACCOUNT_NAME'], process.env['WAZ_STORAGE_ACCESS_KEY'])
						  .withFilter(new azure.ExponentialRetryPolicyFilter());
	} catch(e){
		console.log(e);
	}
		
	console.log("Listening on " + port);
});