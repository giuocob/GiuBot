var args = require('./args');
var fs = require('fs');
var extend = require('extend');

var config = {
	//Each key is an environment
	'test': {
		server: 'irc2.speedrunslive.com',
		nick: 'Giubot-test',
		username: 'Giubot-test',
		owner: 'giuocob',
		racebot: 'giuocob',
		homeChannel: '#giubot'
	},
	'prod-test': {
		server: 'irc2.speedrunslive.com',
		nick: 'Giubot-test',
		username: 'Giubot-test',
		owner: 'giuocob',
		racebot: 'RaceBot',
		homeChannel: '#speedrunslive'
	}
};

var directory = fs.readdirSync(__dirname);
if(directory.indexOf('config-private.js') != -1) {
	var privateConfig = require('./config-private');
	config = extend(true, config, privateConfig);
}

if(!args.env) {
	console.log('No environment specified, exiting');
	process.exit();
}
if(!config[args.env]) {
	console.log('Invalid environment specified, exiting');
	process.exit();
}

module.exports = config[args.env];