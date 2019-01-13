import * as express from "express";
import * as multer from "multer";
import * as cors from "cors";

import * as fs from "fs";
import * as path from "path";
import * as Loki from "lokijs";
const { exec } = require("child_process");
import { functionFilter, loadCollection, cleanFolder } from "./utils";

// setup
const DB_NAME = "db.json";
const COLLECTION_NAME = "functions";
const UPLOAD_PATH = "uploads";
const upload = multer({ dest: `${UPLOAD_PATH}/`, fileFilter: functionFilter });
const db = new Loki(`${UPLOAD_PATH}/${DB_NAME}`, { persistenceMethod: "fs" });
var Docker = require("dockerode");
const dns = require('dns');
var docker = new Docker({ socketPath: "/var/run/docker.sock" });
//var docker = Docker({host: 'http://docker', port: 2375});
docker.listContainers(function (err, containers) {
  if (containers)
    containers.forEach(function (containerInfo) {
      if (containerInfo.Image.includes("registry/")) console.log(containerInfo);
    });
});

// const bindAddress = process.env.ZMQ_BIND_ADDRESS || `tcp://*:5554`;
const brokerAddres = process.env.ZMQ_BROKER_ADDRESS || "tcp://127.0.0.1:5554";

let brokerIdentity = process.env.BrokerIdentity || "MessageBroker";
let brokerIp = process.env.BrokerIP || "localhost";
var zmq = require("zeromq");
var router = zmq.socket("router");
router.identity = "api";

router.on("error", function (err) {
  console.log("SOCKET ERROR", err);
});


setTimeout(() => {
  console.log("connecting " + brokerAddres);
  router.connect(brokerAddres);

  setTimeout(() => {
    var payload = {
      type: "RequestJob",
      body: { id: "Hola" }
    };
    console.log("Sending hello to broker");
    router.send([brokerIdentity, "", JSON.stringify(payload)]);
  }, 2000);
}, 2000);

router.on("message", function () {
  var argl = arguments.length,
    envelopes = Array.prototype.slice.call(arguments, 0, argl - 1),
    message = JSON.parse(
      Array.prototype.slice.call(arguments, 2, argl - 1).toString("utf8")
    ),
    payload = arguments[argl - 1];
  console.log(message);
  //add db fin ejecución

  router.send(["MessageBroker", "", JSON.stringify(payload)]);
  console.log(envelopes.toString("utf8"));
  console.log("incoming request: " + payload.toString("utf8"));
});

// optional: clean all data before start
// cleanFolder(UPLOAD_PATH);
function copyFile(src, dest) {
  let readStream = fs.createReadStream(src);

  readStream.once("error", err => {
    console.log(err);
  });

  readStream.once("end", () => {
    console.log("done copying");
  });

  readStream.pipe(fs.createWriteStream(dest));
}
// app
var bodyParser = require("body-parser");
const app = express();
app.use(cors());
//app.use(bodyParser)
function buildImage(path: string, tag: string) {
  console.log("building image for " + tag);

  docker.buildImage(path, { t: "registry/" + tag }, function (err, output) {
    if (err) {
      console.log(err);
      return;
    }

    output.pipe(process.stdout);
    output.on("end", function () {
      //console.log(response);
      console.log("built image for " + tag);
      const image = docker.getImage("registry/" + tag);
      console.log("pushing image " + tag + " to registry");

      image.push(
        {
          tag: "latest"
        },
        (error, response) => {
          if (error) console.log(error);
          else {
            //console.log(response);
            console.log("pushed image " + tag + " to registry");
            // docker.createContainer({ Image: 'registry/' + tag, Tty: false, name: tag + '_01', PortBindings: { "80/tcp": [{ "HostPort": "8080" }] } }, function (err, container) {
            //   if (err) {
            //     console.log(err);
            //     return;
            //   }
            //   container.start();
            // })
            console.log('running image '+tag);
            docker.run(
              "registry/" + tag,
              ["bash"],
              process.stdout,
              //{ name: tag + "_01", Tty: false, env: ['BrokerIP=' + brokerIp, 'BrokerIdentity='+brokerIdentity] },

              { createOptions: { name: tag + "_01" } },
              function (err, data, container) {
                console.log(container);
                if (err) {
                  console.log(err);
                  return;
                }
                console.log("listing containers");
                docker.listContainers(function (err, containers) {
                  containers.forEach(function (containerInfo) {
                    if (containerInfo.Image == "registry/" + tag)
                      console.log(containerInfo);
                  });
                });
              }
            );
          }
        }
      );
    });
  });
}

function buildImage2(path: string, tag: string) {
  console.log("building image for " + tag);
  docker.buildImage(
    {
      context: path,
      src: ["Dockerfile"]
    },
    { t: tag },
    function (err, response) {
      if (err) console.log(err);
      else console.log(response);
    }
  );
}
app.post("/register", upload.single("function"), async (req, res) => {
  try {
    const col = await loadCollection(COLLECTION_NAME, db);
    const data = col.insert(req.file);
    var mainName = "";
    var dockerFile = "FROM worker \n" + "WORKDIR /usr/src/app\n";

    let outDir = "./uploads/" + req.file.filename + "_data/";
    fs.mkdirSync(outDir);
    if (req.file.originalname.match(/\.(tar)$/)) {
      exec(
        "tar -xvf  " + req.file.path + " -C " + outDir,
        (err, stdout, stderr) => {
          if (err) {
            // node couldn't execute the command
            console.log(err);
            return;
          }

          var packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
          mainName = packageJson.main;
          console.log(mainName);

          dockerFile += "COPY " + outDir + " ./job";

          dockerFile += "RUN cd job && npm install && cd ..\n";
        }
      );
    } else {
      mainName = req.file.filename;
      dockerFile += "COPY " + req.file.filename + " ./job\n";
    }
    dockerFile +=
      "EXPOSE 5554\n" +
      'CMD ["npm", "start","' +
      req.file.filename +
      '_01","job/' +
      mainName +
      '"]';
    fs.writeFile(outDir + "Dockerfile", dockerFile, function (err) {
      if (err) {
        return console.log(err);
      }

      var path = req.file.filename + ".tar";
      exec(
        "tar -cvf  " + path + " -C " + outDir + " Dockerfile",
        (err, stdout, stderr) => {
          if (err) {
            // node couldn't execute the command
            console.log(err);
            return;
          }

          exec(
            "tar -rvf  " + path + " -C ./uploads/ " + req.file.filename,
            (err, stdout, stderr) => {
              if (err) {
                // node couldn't execute the command
                console.log(err);
                return;
              }

              buildImage(path, req.file.filename);
            }
          );
        }
      );

      //buildImage2(outDir, req.file.filename);

      // compressing.gzip.compressFile(outDir + 'Dockerfile', path)
      //   .then(buildImage(path, req.file.filename));
    });

    db.saveDatabase();
    res.send({
      id: data.$loki,
      fileName: data.filename,
      originalName: data.originalname
    });
  } catch (err) {
    console.log(err);
    res.sendStatus(400);
  }
});

app.post("/invoke/:id", async (req, res) => {
  //todo: add db inicio ejecución
  router.send(["MessageBroker", "", { type: req.params.id, body: req.body }]);
  res.sendStatus(200);
});

app.listen(3000, function () {
  console.log("api listening on port 3000!");
});
