import * as express from "express";
import * as multer from "multer";
import * as cors from "cors";
import * as fs from "fs";
import * as path from "path";
import * as Loki from "lokijs";
import { functionFilter, loadCollection, cleanFolder } from "./utils";

// setup
const DB_NAME = "db.json";
const COLLECTION_NAME = "functions";
const UPLOAD_PATH = "uploads";
const upload = multer({ dest: `${UPLOAD_PATH}/`, fileFilter: functionFilter });
const db = new Loki(`${UPLOAD_PATH}/${DB_NAME}`, { persistenceMethod: "fs" });
var Docker = require('dockerode');

var docker = new Docker({socketPath: '/var/run/docker.sock'});
var docker2 = new Docker({protocol:'http', host: 'registry', port: 5000,   version: 'v1.39'});

var routerPort = process.env.ROUTERPORT || 5554;
var zmq = require("zeromq");
var router = zmq.socket("router");
router.identity = "api";
router.connect("tcp://broker:5554");
console.log("api listening on " + routerPort);
router.on("message", function() {
  var argl = arguments.length,
    envelopes = Array.prototype.slice.call(arguments, 0, argl - 1),
    message = JSON.parse(
      Array.prototype.slice.call(arguments, 2, argl - 1).toString("utf8")
    ),
    payload = arguments[argl - 1];
  console.log(message);
     router.send([
      router.identity,
      "",
      JSON.stringify(payload)
    ]);
  console.log(envelopes.toString("utf8"));
  console.log("incoming request: " + payload.toString("utf8"));
});

// optional: clean all data before start
// cleanFolder(UPLOAD_PATH);

// app
const app = express();
app.use(cors());

app.post("/register", upload.single("function"), async (req, res) => {
  try {
    const col = await loadCollection(COLLECTION_NAME, db);
    const data = col.insert(req.file);
    console.log('building image for '+req.file.filename)

    docker.buildImage('./worker/worker.tar', {t: req.file.filename}, function (err, response) {
      if(err)
        console.log(err);
      //console.log(response);
      //...
    });
    db.saveDatabase();
    res.send({
      id: data.$loki,
      fileName: data.filename,
      originalName: data.originalname
    });
  } catch (err) {
    res.sendStatus(400);
  }
});

app.get("/invoke/:id", async (req, res) => {
  
    
    res.sendStatus(200);
});

app.listen(3000, function() {
  console.log("listening on port 3000!");
});
