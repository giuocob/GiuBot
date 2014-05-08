var args = require('./args');

var config = {
	//Each key is an environment
	test: {
		server: 'irc2.speedrunslive.com',
		nick: 'Giubot-test',
		owner: 'giuocob',
		racebot: 'giuocob',
		homeChannel: '#giubot'
	}
};

if(!args.env) {
	console.log('No environment specified, exiting');
	process.exit();
}
if(!config[args.env]) {
	console.log('Invalid environment specified, exiting');
	process.exit();
}

module.exports = config[args.env];