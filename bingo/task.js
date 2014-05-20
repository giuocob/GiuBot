var config = require('../config');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var request = require('request');

var SRL_VERSION = 'v8.1';

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

	self.router.on('kick', function(channel) {
		if(self.raceChannels[channel]) delete self.raceChannels[channel];
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
		],
		long: ['goal set: the legend of zelda: ocarina of time - long bingo'],
		blackout: [
			'goal set: the legend of zelda: ocarina of time - blackout',
			'goal set: the legend of zelda: ocarina of time - team blackout'
		]
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
				if(mode == 'blackout') {
					raceOpts = {blackout: true, teamSize: 1}
				} else {
					raceOpts = {mode: mode};
				}
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
function welcomeMessage(opts) {
	var mode = opts.mode;
	if(opts.blackout) {
		return 'Hello I\'ll automatically generate a blackout-friendly bingo card when the race starts. ' + 
			'If this is a team blackout, type !teamsize <team_size> to specify how large the teams are. To get a regular card instead, type !noblackout';
	} else if(mode == 'short' || mode == 'long') {
		return 'Hello! I\'ll automatically generate a ' + mode + ' bingo card when the race starts.';
	} else {
		return 'Hello! I\'ll automatically generate a bingo card when the race starts.';
	}
}

var welcomeOptOut = 'If you don\'t want a card, type !nobingo.';
var welcomeOptions = 'For more options, type !bingohelp.';
var helpMessages = [
	'Here are the options understood by the GiuBot card setter:',
	'!bingohelp: Display this help dialog.',
	'!nobingo: Do not set a bingo card for this race.',
	'!yesbingo: Undo an application of !nobingo.',
	'!status: Display information about the card GiuBot will set upon race start.',
	'!blackout: Switch the bot into blackout mode.',
	'!mode *card_mode*: Set the card length. Options are short, normal, and long.',
	'!version *card_version*: Set the bingo version to use. Defaults to the current version hosted on SpeedRunsLive.'
];

var disableMessage = 'No card will be set. Type !yesbingo to revert.';
var enableMessage = 'A card will be set. I knew you loved me after all ;)';
var commandNotUnderstood = 'Sorry, I didn\'t understand your request.';

var statusMessage = function(cardStatus) {
	if(cardStatus.active === false) return 'GiuBot will not set a card.';
	var base = 'Mode: ' + cardStatus.mode + ', Version: ' + (cardStatus.version || 'default');
	if(cardStatus.blackout) {
		if(cardStatus.teamSize == 1) {
			base = 'BLACKOUT   ' + base;
		} else {
			base = 'TEAM BLACKOUT (' + cardStatus.teamSize + ' players per team)   ' + base;
		}
	}
	return base;
}
var invalidMode = 'Invalid mode specified. Must be one of (short, normal, long).';
var modeUpdated = 'Mode updated.';
var invalidVersion = 'Invalid version specified.';
var versionUpdated = 'Version updated.';

var blackoutMessage = 'Blackout mode initiated! I will find a blackout-friendly card for the race. If this is a team blackout, ' +
	'type !teamsize <team_size> to specify how large the teams are. To revert, type !noblackout.'
var noBlackoutMessage = 'Blackout mode disabled.';
var teamSizeUpdated = 'Team size updated.';
var invalidTeamSize = 'Invalid argument given for team size.';

var cardSetError = 'Sorry, there was an error while setting the card.';

var rematchMessage = 'Ready to go again! Card status: '

util.inherits(BingoInstance, EventEmitter);

function BingoInstance(router, bingoChannel, opts) {
	this.router = router;
	this.channel = bingoChannel;
	this.cardOptions = { mode: opts.mode || 'normal', active: true, version: 'default', blackout: opts.blackout || false, teamSize: opts.teamSize || 1 };
	this.raceState = 0;
	/*
	 * State reference:
	 * 0: Race has not yet started. Options may be changed freely.
	 * 1: Race is in countdown. No options may be changed.
	 * 2: Race has begun. Card will have been posted and we will wait for race to complete.
	 * 3: Race is over. Bot will idle until kicked by racebot; a rematch command will return to state 0.
	 */

	 this.router.say(this.channel, welcomeMessage(this.cardOptions));
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
	} else if(message == '!blackout') {
		if(self.raceState == 0 && self.cardOptions.active === true) {
			self.cardOptions.blackout = true;
			self.cardOptions.teamSize = 1;
			self.router.say(self.channel, blackoutMessage);
		}
	} else if(message == '!noblackout') {
		if(self.raceState == 0 && self.cardOptions.active === true && self.cardOptions.blackout === true) {
			self.cardOptions.blackout = false;
			self.router.say(self.channel, noBlackoutMessage);
		}
	} else if(message.indexOf('!teamsize') == 0) {
		if(self.raceState == 0 && self.cardOptions.active === true && self.cardOptions.blackout === true) {
			var messageSplit = message.split(' ');
			if(messageSplit.length != 2) return self.router.say(self.channel, commandNotUnderstood);
			var size = parseInt(messageSplit[1]);
			if(isNaN(size) || size < 1 || size > 100) return self.router.say(self.channel, invalidTeamSize);
			self.cardOptions.teamSize = size;
			self.router.say(self.channel, teamSizeUpdated);
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
		if(message.indexOf('Race recorded!') != -1 || message.indexOf('Race terminated.') != -1) {
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
		params['version'] = SRL_VERSION;
	} else {
		params['version'] = self.cardOptions.version;
	}
	params['mode'] = self.cardOptions.mode || 'normal';

	if(!self.cardOptions.blackout) {
		params['seed'] = Math.floor(Math.random() * 1000000);
		finalSet();
	} else {
		params.teamSize = self.cardOptions.teamSize;
		request({
			uri: 'http://giuocob.herokuapp.com/api/bingo/card/blackout',
			method: 'GET',
			qs: params
		}, function(error, response, body) {
			if(error) return self.router.say(self.channel, cardSetError);
			try {
				body = JSON.parse(body);
			} catch(e) {
				return self.router.say(self.channel, cardSetError);
			}
			params.seed = body.seed;
			finalSet();
		});
	}



	function finalSet() {
		var cardUrl = getCardUrl(params);
		self.router.say(self.channel, '.setgoal ' + cardUrl);
	}

	function getCardUrl(opts) {
		var url;
		if(opts.version == SRL_VERSION) url = 'http://www.speedrunslive.com/tools/oot-bingo/?';
		else url = 'http://giuocob.herokuapp.com/bingo/all-version-bingo.html?version=' + opts.version + '&';
		url += 'mode=' + opts.mode + '&seed=' + opts.seed;
		return url;
	}
};

exports.Task = BingoTask;