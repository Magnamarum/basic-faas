var routerPort = process.env.ROUTERPORT || 5554;
var zmq = require("zeromq");
var router = zmq.socket("router");
router.on('error', function(err) {
  console.log("SOCKET ERROR", err);
});
var identity = process.argv[2];
var functionName = process.argv[3];
const func = require("./"+functionName);
router.identity = identity;

let brokerAddres = process.env.BrokerIP || "localhost";
let brokerIdentity = process.env.BrokerIdentity || "MessageBroker";
router.connect("tcp://"+brokerAddres+":5554");
setTimeout(() => {
  var payload = {
    type: "RequestJob",
    body: { id: "Hola" }
  };
  console.log("Sending hello to broker");
  router.send([brokerIdentity, "", JSON.stringify(payload)]);
}, 2000);

router.on("message", function() {
  var argl = arguments.length,
    envelopes = Array.prototype.slice.call(arguments, 0, argl - 1),
    message = JSON.parse(
      Array.prototype.slice.call(arguments, 2, argl - 1).toString("utf8")
    ),
    payload = arguments[argl - 1];
  console.log(message);
  var result = func(payload);
  router.send([router.identity, "", JSON.stringify(result)]);
  console.log(envelopes.toString("utf8"));
  console.log("incoming request: " + payload.toString("utf8"));
});
