import * as express from "express";
import * as cors from "cors";

// setup

var routerPort = process.env.ROUTERPORT || 5554;
var zmq = require("zeromq");
var router = zmq.socket("router");
router.identity = "MessageBroker";
var kue = require("kue"),
  queue = kue.createQueue({ redis: "redis://redis:6379" });
router.bindSync("tcp://*:" + routerPort);
console.log("MessageBroker listening on " + routerPort);
router.on("message", function() {
  var argl = arguments.length,
    envelopes = Array.prototype.slice.call(arguments, 0, argl - 1),
    message = JSON.parse(
      Array.prototype.slice.call(arguments, 2, argl - 1).toString("utf8")
    ),
    payload = arguments[argl - 1];
  console.log(message);
  queue.create(payload.type, JSON.stringify(payload));
  console.log(envelopes.toString("utf8"));
  console.log("incoming request: " + payload.toString("utf8"));

  //   var header = {
  //     Identity: 0,
  //     MessageType: 1,
  //     ActionType: 201,
  //     ConfirmId: 0
  //   };
  //   router.send([
  //     router.identity,
  //     "",
  //     JSON.stringify(header),
  //     JSON.stringify(payload)
  //   ]);
});

// app
const app = express();
app.use(cors());

app.get("/", async (req, res) => {
  res.send("");
});

app.post("/", async (req, res) => {});

app.listen(3000, function() {
  console.log("listening on port 3000!");
});
