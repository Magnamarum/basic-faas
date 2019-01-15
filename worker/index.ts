var routerPort = process.env.ROUTERPORT || 5554;
var zmq = require("zeromq");
var router = zmq.socket("router");
router.on('error', function(err) {
  console.log("SOCKET ERROR", err);
});
var identity = process.argv[2];
var functionName = process.argv[3];
var functionId = process.argv[4];
const func = require("./"+functionName);
router.identity = identity;

let brokerAddres = process.env.BrokerIP || "localhost";
let brokerIdentity = process.env.BrokerIdentity || "MessageBroker";
console.log('Connecting to '+brokerIdentity+' on tcp://'+brokerAddres+':5554');
router.connect("tcp://"+brokerAddres+":5554");
setTimeout(() => {
  var payload = {
    type: "RequestJob",
    body: { id: functionId }
  };
  console.log("Requesting job to broker");
  router.send([brokerIdentity, "", JSON.stringify(payload)]);
}, 2000);

router.on("message", function() {
  console.log(arguments);

  var argl = arguments.length,
    requesterIdentity = arguments[0].toString("utf8"),
    payload = JSON.parse(arguments[argl - 1].toString("utf8"));
  console.log("Received message from " + requesterIdentity);
  console.log("with body: ");
  console.log(payload.body);
  var result = func(payload);
  var response = { type: 'Response', uid: payload.uid, body: result }
  console.log('Resultado: ');
  console.log(JSON.stringify(result));
  router.send([requesterIdentity, "", JSON.stringify(response)]);
});
