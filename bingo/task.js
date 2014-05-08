var config = require('../config');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

var BingoTask = function(router) {
	this.router = router;
	this.homeChannel = config.homeChannel;
	this.raceChannels = {};
};

BingoTask.prototype.start = function(cb) {
	var self = this;

	self.router.on('message', function(nick, channel, message) {
		if(channel == self.homeChannel) {
			self.parseHomeChannelMessage(nick, message);
		} else {
			if(!self.raceChannels[channel]) return;
			self.raceChannels[channel].emit('message', nick, message);
		}
	});

	self.router.subscribe(self.homeChannel, function(error) {
		if(error) return cb(error);
		self.router.subscribe('#giubot2', function(error) {
			if(error) return cb(error);
			cb();
		});
	});
};

BingoTask.prototype.parseHomeChannelMessage = function(nick, message) {
	var self = this;
	//For now we only care about messages that appear to be spawning a bingo race
	if(nick != config.racebot) return;
	var raceGenesisSnippets = {
		short: ['goal set: the legend of zelda: ocarina of time - short bingo'],
		normal: [
			'goal set: the legend of zelda: ocarina of time - bingo',
			'goal set: the legend of zelda: ocarina of time - saturday night bingo',
			'test'
		],
		long: ['goal set: the legend of zelda: ocarina of time - long bingo']
	};

	function fetchChannel(message) {
		var startingIndex = message.indexOf('#srl-');
		if(startingIndex == -1) return null;
		var channel = message.slice(startingIndex, startingIndex+10);
		return channel;
	}

	message = message.toLowerCase();
	var raceChannel, raceOpts;
	for(var i=0;i<Object.keys(raceGenesisSnippets).length;i++) {
		var mode = Object.keys(raceGenesisSnippets)[i];
		var snippets = raceGenesisSnippets[mode];
		for(var k=0;k<snippets.length;k++) {
			if(message.indexOf(snippets[k]) != -1) {
				raceChannel = fetchChannel(message);
				if(!raceChannel) continue;
				raceOpts = {mode: mode};
				break;
			}
		}
		if(raceChannel) break;
	}
	//If race channel not set, it's not a race starting message and we can ignore
	if(!raceChannel) return;

	//Check to see if we're already administering this channel
	if(self.raceChannels[raceChannel]) return;

	//Create a new bingo instance
	self.router.subscribe(raceChannel, function(error) {
		if(error) return;
		var bingoInstance = new BingoInstance(self.router, raceChannel, raceOpts);
		self.raceChannels[raceChannel] = bingoInstance;
	});
};

//Message template functions
function welcomeMessage(mode) {
	if(mode == 'short' || mode == 'long') {
		return 'Hello! I\'ll automatically generate a ' + mode + ' bingo card when the race starts.';
	} else {
		return 'Hello! I\'ll automatically generate a bingo card when the race starts.';
	}
}

var welcomeOptOut = 'If you don\'t want me to, type !nobingo.';
var welcomeOptions = 'For more options, type !bingohelp.';
var helpMessages = [
	'Here are the options understood by the GiuBot card setter:',
	'!bingohelp: Display this help dialog.',
	'!nobingo: Do not set a bingo card for this race.',
	'!yesbingo: Undo an application of !nobingo.',
	'!status: Display information about the card GiuBot will set upon race start.',
	'!mode *card_mode*: Set the card length. Options are short, normal, and long.',
	'!version *card_version*: Set the bingo version to use. Defaults to the current version hosted on SpeedRunsLive.'
];

var disableMessage = 'No card will be set. Type !yesbingo to revert.';
var enableMessage = 'A card will be set. I knew you loved me after all ;)';
var commandNotUnderstood = 'Sorry, I didn\'t understand your request.';

var statusMessage = function(cardStatus) {
	if(cardStatus.active === false) return 'GiuBot will not set a card.';
	return 'Mode: ' + cardStatus.mode + ', Version: ' + (cardStatus.version || 'default');
}
var invalidMode = 'Invalid mode specified. Must be one of (short, normal, long).';
var modeUpdated = 'Mode updated.';
var invalidVersion = 'Invalid version specified.';
var versionUpdated = 'Version updated.';

var rematchMessage = 'Ready to go again! Card status: '

util.inherits(BingoInstance, EventEmitter);

function BingoInstance(router, bingoChannel, opts) {
	this.router = router;
	this.channel = bingoChannel;
	this.cardOptions = { mode: opts.mode, active: true, version: 'default' };
	this.raceState = 0;
	/*
	 * State reference:
	 * 0: Race has not yet started. Options may be changed freely.
	 * 1: Race is in countdown. No options may be changed.
	 * 2: Race has begun. Card will have been posted and we will wait for race to complete.
	 * 3: Race is over. Bot will idle until kicked by racebot; a rematch command will return to state 0.
	 */

	 this.router.say(this.channel, welcomeMessage(this.cardOptions.mode));
	 this.router.say(this.channel, welcomeOptOut);
	 this.router.say(this.channel, welcomeOptions);


	 //Set up message handling
	 var self = this;
	 self.on('message', function(nick, message) {
	 	if(nick == config.racebot) {
	 		self.processRacebotMessage(message);
	 	} else {
	 		self.processUserMessage(nick, message);
	 	}
	});
};

BingoInstance.prototype.processUserMessage = function(nick, message) {
	var self = this;
	message = message.trim();
	if(message == '!bingohelp') {
		helpMessages.forEach(function(helpMessage) {
			self.router.say(self.channel, helpMessage);
		});
	} else if(message == '!nobingo') {
		if(self.raceState == 0 && self.cardOptions.active === true) {
			self.cardOptions.active = false;
			self.router.say(self.channel, disableMessage);
		}
	} else if(message == '!yesbingo') {
		if(self.raceState == 0 && self.cardOptions.active === false) {
			self.cardOptions.active = true;
			self.router.say(self.channel, enableMessage);
		}
	} else if(message == '!status') {
		if(self.raceState == 0) {
			self.router.say(self.channel, statusMessage(self.cardOptions));
		}
	} else if(message.indexOf('!mode') == 0) {
		if(self.raceState == 0 && self.cardOptions.active === true) {
			var validModes = ['short', 'normal', 'long'];
			var messageSplit = message.toLowerCase().split(' ');
			if(messageSplit.length != 2) return self.router.say(self.channel, commandNotUnderstood);
			var newMode = messageSplit[1];
			if(validModes.indexOf(newMode) == -1) return self.router.say(self.channel, invalidMode);
			self.cardOptions.mode = newMode;
			self.router.say(self.channel, modeUpdated);
		}
	} else if(message.indexOf('!version') == 0) {
		if(self.raceState == 0 && self.cardOptions.active === true) {
			var validVersions = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v7.1', 'v8', 'v8.1', 'default'];
			var messageSplit = message.toLowerCase().split(' ');
			if(messageSplit.length != 2) return self.router.say(self.channel, commandNotUnderstood);
			var newVersion = messageSplit[1];
			if(validVersions.indexOf(newVersion) == -1) return self.router.say(self.channel, invalidVersion);
			self.cardOptions.version = newVersion;
			self.router.say(self.channel, versionUpdated);
		}
	}
};

BingoInstance.prototype.processRacebotMessage = function(message) {
	var self = this;
	if(self.raceState == 0) {
		if(message.indexOf('The race will begin in 10 seconds!') != -1) {
			self.raceState = 1;
		}
	} else if(self.raceState == 1) {
		if(message.indexOf('GO!') != -1) {
			self.raceState = 2;
			self.setCard();
		}
	} else if(self.raceState == 2) {
		if(message.indexOf('Race recorded!') != -1) {
			self.raceState = 3;
		}
	} else if(self.raceState == 3) {
		if(message.indexOf('Rematch!') != -1) {
			self.raceState = 0;
			if(self.cardOptions.active === true) {
				self.router.say(self.channel, rematchMessage);
				self.router.say(self.channel, statusMessage(self.cardOptions));
			}
		}
	}
};

BingoInstance.prototype.setCard = function() {
	var self = this;
	if(self.cardOptions.active === false) return;
	var urlBase, params = {};
	if(self.cardOptions.version == 'default') {
		urlBase = 'www.speedrunslive.com/tools/oot-bingo/';
	} else {
		urlBase = 'http://giuocob.herokuapp.com/bingo/all-version-bingo.html';
		params['version'] = self.cardOptions.version;
	}
	params['mode'] = self.cardOptions.mode;
	params['seed'] = 100000 + Math.floor(Math.random() * 900000);

	var url = urlBase;
	var queryKeys = Object.keys(params);
	for(var i=0;i<queryKeys.length;i++) {
		var key = queryKeys[i];
		var value = params[key];
		if(i == 0) {
			url += '?';
		} else {
			url += '&';
		}
		url += key + '=' + value;
	}
	self.router.say(self.channel, '.setgoal ' + url);
};

exports.Task = BingoTask;