// import * as express from "express";
// import * as cors from "cors";

// setup
const EventEmitter = require('events');
const workerEmitter = new EventEmitter();

var routerPort = process.env.ROUTERPORT || 5554;
var workersByType = {};

var zmq = require("zeromq");
var router = zmq.socket("router");
router.on("error", function (err) {
  console.log("SOCKET ERROR", err);
});
router.identity = "MessageBroker";

const redisAddress = process.env.REDIS_ADDRESS || "redis://localhost:6379";
var kue = require("kue"),
  queue = kue.createQueue({ redis: redisAddress });

const bindAddress = process.env.ZMQ_BIND_ADDRESS || `tcp://*:5554`;
router.bindSync(bindAddress);

function processJob(type, payload, done) {
  let workersToProcess = workersByType[type];
  let worker = workersToProcess.shift();
  router.send([worker, "", payload]);
  done();
}

console.log("MessageBroker listening on " + bindAddress);
router.on("message", function () {
  console.log(arguments);

  var argl = arguments.length,
    requesterIdentity = arguments[0].toString("utf8"),
    payload = JSON.parse(arguments[argl - 1].toString("utf8"));
  console.log("Received message from " + requesterIdentity);
  console.log("with body: ");
  console.log(payload);
  //console.log(message);
  console.log(payload.type);
  console.log(JSON.stringify(payload.body));
  if (payload.type == "RequestJob") {
    // queue.inactiveCount(payload.body.id, function(err, total) {
    //   if (err) {
    //     console.log(err);
    //   }
    //   if (total > 0) {
    var workers = workersByType[payload.body.id];
    if (workers) {
      workers.push(requesterIdentity);
    }
    else {
      workersByType[payload.body.id] = [requesterIdentity];
      queue.process(payload.body.id, function (job, done) {
        console.log(
          "Processing job " + payload.body.id + " with data " + job.data
        );
        if (!workersByType[payload.body.id].some()) { // si no hay workers disponibles
          workerEmitter.once(payload.body.id, processJob(payload.body.id, job.data, done));
        } else {
          processJob(payload.body.id, job.data, done);
        }
      });
    }
    workerEmitter.emit(payload.type);

    // }
    // });
  } else {
    queue.create(payload.body.id, JSON.stringify(payload.body)).save();
  }

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
