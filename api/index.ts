import * as express from "express";
import * as multer from "multer";
import * as cors from "cors";

import * as fs from "fs";
import * as path from "path";
import * as Loki from "lokijs";
const { exec } = require("child_process");
import { functionFilter, loadCollection, cleanFolder } from "./utils";
const redis = require('redis');
const redisClient = redis.createClient(6379, "redis");

const uuidV1 = require('uuid/v1');

redisClient.on('connect', function () {
  console.log('Redis client connected');
});

redisClient.on('error', function (err) {
  console.log('Something went wrong ' + err);
});

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
      if (containerInfo.Image.includes("registry/")) console.log(containerInfo.Id);
    });
});

// const bindAddress = process.env.ZMQ_BIND_ADDRESS || `tcp://*:5554`;
const brokerAddres = process.env.ZMQ_BROKER_ADDRESS || "tcp://127.0.0.1:5554";

let brokerIdentity = process.env.BrokerIdentity || "MessageBroker";
let brokerIp = process.env.BrokerIP || "localhost";
var zmq = require("zeromq");
var router = zmq.socket("router");
router.identity = process.env.ApiIdentity || "api";

router.on("error", function (err) {
  console.log("SOCKET ERROR", err);
});


setTimeout(() => {
  console.log("connecting " + brokerAddres);
  router.connect(brokerAddres);
}, 2000);

router.on("message", function () {
  console.log(arguments);
  var argl = arguments.length,
    requesterIdentity = arguments[0].toString("utf8"),
    payload = JSON.parse(arguments[argl - 1].toString("utf8"));
  console.log("Received message from " + requesterIdentity);
  console.log("with body: ");
  console.log(payload);
  redisClient.get(payload.uid, function (error, result) {
    if (error) {
      console.log(error);
      throw error;
    }
    console.log('GET result ->' + result);

    let resultJson = JSON.parse(result);
    let now = Date.now();
    let elapsedTime = now - resultJson.start;

    let value = {
      start: resultJson.start,
      body: resultJson.body,
      end: now,
      response: payload,
      elapsedTime: elapsedTime
    }
    console.log(elapsedTime+ ' ms');
    redisClient.set(payload.uid, JSON.stringify(value), redis.print);

  });
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

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json());;
app.use(cors());
//app.use(bodyParser)
function buildImage(path: string, tag: string, mainName: string) {
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
            console.log('running image ' + tag);
            docker.run(
              "registry/" + tag,
              ["npm", "start", tag + '_01', 'job/' + mainName, tag],
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

              }
            );

            docker.listContainers(function (err, containers) {
              containers.forEach(function (container) {
                if (container.Image == "registry/" + tag)
                  docker.listNetworks(function (err, networks) {
                    if (err) {
                      console.log(err);
                    }
                    else {
                      networks.forEach(function (network) {
                        network.connect({
                          Container: container.id
                        }, function (err, data) {
                          console.log(data);
                        });
                      })
                    }
                  });
              });
            });


          }
        }
      );
    });
  });
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
      console.log('Recibido .tar');
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
          dockerFile += "RUN ls -la\n"
          dockerFile += "COPY " + req.file.filename + "/ ./job/\n";

          dockerFile += "RUN cd job && npm install && cd ..\n";
          dockerFile +=
            "EXPOSE 5554\n" +
            'ENV BrokerIP=' + brokerIp + '\n' +
            'CMD ["npm", "start","' +
            req.file.filename +
            '_01","job/' +
            mainName +
            '", "' + req.file.filename + '"]';
          console.log(dockerFile);

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

                    buildImage(path, req.file.filename, mainName);
                    db.saveDatabase();
                    res.send( data.filename);
                  }
                );
              }
            );

          });
        }
      );
    } else {
      mainName = req.file.filename;
      dockerFile += "COPY " + req.file.filename + " ./job/\n";
      dockerFile +=
        "EXPOSE 5554\n" +
        'ENV BrokerIP=' + brokerIp + '\n' +
        'CMD ["npm", "start","' +
        req.file.filename +
        '_01","job/' +
        mainName +
        '", "' + req.file.filename + '"]';
      console.log(dockerFile);

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

                buildImage(path, req.file.filename, mainName);
                db.saveDatabase();
                res.send( data.filename);
              }
            );
          }
        );

      });
    }


  } catch (err) {
    console.log(err);
    res.sendStatus(400);
  }
});
app.get('/status/:id', async (req, res) => {
  let id = req.params.id;
  redisClient.get(id, function (error, result) {
    if (error) {
      console.log(error);
      throw error;
    }
    res.send(result);
  });
});
app.post("/invoke/:id", async (req, res) => {
  //todo: add db inicio ejecución
  console.log('Invocando ' + req.params.id + ' con body:');
  let id = uuidV1();
  let value = {
    start: Date.now(),
    body: req.body
  }
  redisClient.set(id, JSON.stringify(value), redis.print);
  redisClient.get(id, function (error, result) {
    if (error) {
      console.log(error);
      throw error;
    }
    console.log('GET result ->' + result);
  });
  //console.log(req);
  console.log(req.body);
  router.send([brokerIdentity, "", JSON.stringify({ type: req.params.id, body: req.body, uid: id })]);
  res.send(id);
});

app.listen(3000, function () {
  console.log("api listening on port 3000!");
});
