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
 * Common routes
 * ---------------------------------------- */
app.get('/', function (req, res) {
	
	var blobClient = azure.createBlobService(process.env['WAZ_STORAGE_ACCOUNT'], process.env['WAZ_STORAGE_ACCESS_KEY'])
						  .withFilter(new azure.ExponentialRetryPolicyFilter());
	
	blobClient.listContainers({}, function(e, r) {
		res.render('index', {layout: false, data: r});
	});
});

/*
 * Bootstrap
 * ---------------------------------------- */
var port = process.env.PORT || 3000;

app.listen(port, function () {
	console.log("Listening on " + port);
});