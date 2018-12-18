
module.exports = function start(functionName) {
  const func = require("./" + functionName);
  console.log(func(process.argv[2]));
}
