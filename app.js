var irc = require('irc');
var config = require('./config');
var ircRouter = require('./irc-router');

var client = new irc.Client(config.server, config.nick, {
	autoConnect: false,
	userName: config.username
});

client.connect(function() {
	console.log('Connected!')
	setTimeout(function() {
		client.say('NickServ', 'IDENTIFY ' + config.password);
		client.join(config.homeChannel, function() {
			console.log('Joined main channel!');
			ircRouter.start(client, function(error) {
				if(error) {
					console.log(error);
					process.exit();
				}
				console.log('All tasks initialized.')
			});
		});
	}, 2000);
});



//Error handler
client.on('error', function(message) {
	console.log('AN ERROR OCCURRED');
	console.log(message);
	process.exit();
});