//Manage the list of active tasks and route irc messages to the appropriate ones.

var irc = require('irc');
var async = require('async');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var config = require('./config');

//Map of task ids to the file path leading to their root script
var taskConfig = {
	bingo: './bingo/task'
};

//The client object, global to this file
var client;

//The important one: map of taskIds to the task objects, as well as important information about them
var tasks = {};

//List of all channels we are currently in. We need this because of dumb bug in irc client.
var currentChannels = [config.homeChannel];

//Object to pass to each created task, allowing it to do things such as subscribe to messages
var RouterUtils = function(taskId) {
	this.taskId = taskId;
};

util.inherits(RouterUtils, EventEmitter);

RouterUtils.prototype.subscribe = function(channel, cb) {
	if(tasks[this.taskId].channels.indexOf(channel) != -1) return;
	tasks[this.taskId].channels.push(channel);
	if(currentChannels.indexOf(channel) == -1) {
		join(channel,cb);
	} else {
		cb();
	}
};

function join(channel, cb) {
	if(currentChannels.indexOf(channel) != -1) cb();
	client.join(channel, function() {
		currentChannels.push(channel);
		cb();
	});
};

//This just unsubscribes from the specified channel, and parts it if no other tasks are subscribed to it
RouterUtils.prototype.unsubscribe = function(channel, cb) {
	var self = this;
	if(tasks[this.taskId].channels.indexOf(channel) == -1) return;
	tasks[this.taskId].channels.splice(tasks[this.taskId].channels.indexOf(channel), 1);

	var importantChannel = false;
	Object.keys(tasks).forEach(function(taskId) {
		if(tasks[taskId].channels.indexOf(channel) != -1) importantChannel = true;
	});
	if(!importantChannel && currentChannels.indexOf(channel) != -1) {
		client.part(channel, '', function() {
			cb();
		});
	} else {
		cb();
	}
};

RouterUtils.prototype.say = function(channel, message) {
	client.say(channel, message);
}



exports.start = function(ircClient, cb) {
	client = ircClient;
	async.each(Object.keys(taskConfig), function(taskId, cb) {
		var taskModule = require(taskConfig[taskId]);
		var router = new RouterUtils(taskId);
		var taskObject = new taskModule.Task(router);
		tasks[taskId] = {
			task: taskObject,
			router: router,
			channels: []
		};
		taskObject.start(function(error) {
			if(error) return cb(error);
			cb();
		});
	}, function(error) {
		if(error) return cb(error);
		routerSetup(cb);
	});
};

function routerSetup(cb) {
	//Route messages

	function routeEvent(eventName, channel) {
		var args = Array.prototype.slice.call(arguments);
		//Scan all tasks to determine where this message needs to be sent
		Object.keys(tasks).forEach(function(taskId) {
			for(var i=0;i<tasks[taskId].channels.length;i++) {
				if(tasks[taskId].channels[i] == channel) {
					tasks[taskId].router.emit.apply(tasks[taskId].router, [eventName].concat(args.slice(2)));
					break;
				}
			}
		});
	}

	client.on('message', function(nick, to, text, message) {
		routeEvent('message', to, nick, to, text);
	});

	client.on('kick', function(nick, to, text, message) {
		routeEvent('kick', to, to);
	});

	cb();
}