

var BingoTask = function(router) {
	this.router = router;

	router.on('message', function(nick, channel, message) {
		console.log('GOT A MESSAGE FROM ' + nick + ' IN ' + channel + ": " + message);
	});
}

BingoTask.prototype.start = function(cb) {
	var self = this;
	self.router.joinAndSubscribe('#giubot2', function(error) {
		if(error) return cb(error);
		self.router.joinAndSubscribe('#giubot', function(error) {
			if(error) return cb(error);
			cb();
		});
	});
};

exports.Task = BingoTask;