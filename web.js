var express 		= require('express')
	, url			= require('url')
	, azure			= require('azure-0.4.7')
	, fs			= require('fs');

/*
 * Configuration
 * ---------------------------------------- */
var app = express.createServer(express.logger());

app.register('html', require('ejs'));

app.set('views', __dirname + '/views');
app.set('view engine', 'html');

app.enable("jsonp callback");

app.use(function(req, res, next) {		
	res.locals.path = url.parse(req.url).pathname;

	res.locals.contentFor = function (section, str) {
		res.locals[section] = str;
	};

	next();
});

app.configure('development', function () {
	app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function () {
	app.use(express.errorHandler());
});

app.configure(function () {
	app.use(express.methodOverride());
	app.use(express.bodyParser());
	app.use(app.router);
	app.use(express.static(__dirname + '/static'));
});

/*
 * Routes
 * ---------------------------------------- */
app.get('/', function (req, res) {	
	res.render('index', {layout: false });
});

app.get('/blobs', function (req, res) {
	res.render('blobs', {layout: false });
});

app.get('/blobs-azure', function (req, res) {
	res.render('blobs-azure', {layout: false });	
});

app.get('/blobs/write', function (req, res) {
	var start = new Date();
	var blobClient = azure.createBlobService(process.env['WAZ_STORAGE_ACCOUNT'], process.env['WAZ_STORAGE_ACCESS_KEY'])
						  .withFilter(new azure.ExponentialRetryPolicyFilter());

	blobClient.listContainers({}, function(e, r) {
		var time = new Date() - start;
		res.json({time: time.toString()});
	});
});

/*
 * Bootstrap
 * ---------------------------------------- */
var port = process.env.PORT || 3000;

app.listen(port, function () {
	console.log("Listening on " + port);
});