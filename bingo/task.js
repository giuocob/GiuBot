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
			console.log(snippets[k]);
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
		var bingoInstance = new BingoInstance(raceChannel, raceOpts);
		self.raceChannels[raceChannel] = bingoInstance;
	});
};

var BingoInstance = function(bingoChannel, opts) {
	this.channel = bingoChannel;
	console.log('IN THERE! In channel ' + bingoChannel + ', mode = ' + opts.mode);
};

util.inherits(BingoInstance, EventEmitter);

exports.Task = BingoTask;