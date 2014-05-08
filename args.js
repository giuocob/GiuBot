//Super naive command line argument parsing

var defaultArgs = {
	env: 'test'
};

for(var i=2;i<process.argv.length;i++) {
	var arg = process.argv[i];
	if(arg == '-e') {
		//Next argument is environment
		i++;
		defaultArgs.env = process.argv[i];
		continue;
	}
}

module.exports = defaultArgs;