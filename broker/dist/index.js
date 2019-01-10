// import * as express from "express";
// import * as cors from "cors";
// setup
var routerPort = process.env.ROUTERPORT || 5554;
var zmq = require("zeromq");
var router = zmq.socket("router");
router.on('error', function (err) {
    console.log("SOCKET ERROR", err);
});
router.identity = "MessageBroker";
const redisAddress = process.env.REDIS_ADDRESS || 'redis://192.168.99.100:6379';
var kue = require("kue"), queue = kue.createQueue({ redis: redisAddress });
const bindAddress = process.env.ZMQ_BIND_ADDRESS || `tcp://*:5554`;
router.bindSync(bindAddress);
console.log("MessageBroker listening on " + bindAddress);
router.on("message", function () {
    console.log(arguments);
    var argl = arguments.length, requesterIdentity = arguments[0].toString("utf8"), payload = JSON.parse(arguments[argl - 1].toString("utf8"));
    console.log('Received message from ' + requesterIdentity);
    console.log('with body: ');
    console.log(payload);
    //console.log(message);
    queue.create(payload.type, JSON.stringify(payload));
    if (payload.type == 'RequestJob') {
    }
    else {
    }
    //console.log(envelopes.toString("utf8"));
    //console.log("incoming request: " + payload.toString("utf8"));
});
// app
// const app = express();
// app.use(cors());
// app.get("/", async (req, res) => {
//   res.send("");
// });
// app.post("/", async (req, res) => {});
// app.listen(3000, function() {
//   console.log("listening on port 3000!");
// });
//# sourceMappingURL=index.js.map