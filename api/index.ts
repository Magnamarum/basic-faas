import * as express from "express";
import * as multer from "multer";
import * as cors from "cors";
import * as fs from "fs";
import * as path from "path";
import * as Loki from "lokijs";
const { exec } = require('child_process');
import { functionFilter, loadCollection, cleanFolder } from "./utils";

// setup
const DB_NAME = "db.json";
const COLLECTION_NAME = "functions";
const UPLOAD_PATH = "uploads";
const upload = multer({ dest: `${UPLOAD_PATH}/`, fileFilter: functionFilter });
const db = new Loki(`${UPLOAD_PATH}/${DB_NAME}`, { persistenceMethod: "fs" });
var Docker = require('dockerode');

var docker = new Docker({ socketPath: '/var/run/docker.sock' });
var docker2 = new Docker({ protocol: 'http', host: 'registry', port: 5000, version: 'v1.39' });

var routerPort = process.env.ROUTERPORT || 5554;
var zmq = require("zeromq");
var router = zmq.socket("router");
router.identity = "api";
router.connect("tcp://broker:5554");
console.log("api listening on " + routerPort);
router.on("message", function () {
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
function copyFile(src, dest) {

  let readStream = fs.createReadStream(src);

  readStream.once('error', (err) => {
    console.log(err);
  });

  readStream.once('end', () => {
    console.log('done copying');
  });

  readStream.pipe(fs.createWriteStream(dest));
}
// app
const app = express();
app.use(cors());
function buildImage(path: string, tag: string) {

  console.log('building image for ' + tag);

  docker.buildImage(path, { t: "registry/" + tag }, function (err, output) {
    if (err) {
      console.log(err);
      return;
    }

    output.pipe(process.stdout);
    output.on('end', function () {
      //console.log(response);
      console.log('built image for ' + tag);
      const image = docker.getImage('registry/' + tag);
      console.log('pushing image ' + tag + ' to registry');

      image.push({
        tag: "latest",
      }, (error, response) => {
        if (error)
          console.log(error);
        else {
          //console.log(response);
          console.log('pushed image ' + tag + ' to registry');
          // docker.createContainer({ Image: 'registry/' + tag, Tty: false, name: tag + '_01', PortBindings: { "80/tcp": [{ "HostPort": "8080" }] } }, function (err, container) {
          //   if (err) {
          //     console.log(err);
          //     return;  
          //   }
          //   container.start();
          // })
          docker.run('registry/' + tag, ['bash'], process.stdout, { createOptions: { name: tag + '_01' } }, function (err, data, container) {
            if (err) {
              console.log(err);
              return;
            }
            console.log('listing containers')
            docker.listContainers(function (err, containers) {
              containers.forEach(function (containerInfo) {
                if (containerInfo.Image == 'registry/' + tag)
                  console.log(containerInfo);
              });
            });
          });
        }
      });;

    });


  });

}

function buildImage2(path: string, tag: string) {

  console.log('building image for ' + tag);
  docker.buildImage({
    context: path,
    src: ['Dockerfile']
  }, { t: tag }, function (err, response) {
    if (err)
      console.log(err);
    else console.log(response);
  });
}
app.post("/register", upload.single("function"), async (req, res) => {
  try {
    const col = await loadCollection(COLLECTION_NAME, db);
    const data = col.insert(req.file);
    var mainName = '';
    var dockerFile = 'FROM worker \n' +
      'WORKDIR /usr/src/app\n';

    let outDir = './uploads/' + req.file.filename + '_data/';
    fs.mkdirSync(outDir);
    if (req.file.originalname.match(/\.(tar)$/)) {
      exec('tar -xvf  ' + req.file.path + ' -C ' + outDir, (err, stdout, stderr) => {
        if (err) {
          // node couldn't execute the command
          console.log(err);
          return;
        }

        var packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        mainName = packageJson.main;
        console.log(mainName);

        dockerFile += 'COPY ' + outDir + ' ./job';

        dockerFile += 'RUN cd job && npm install && cd ..\n';
      });
    }
    else {
      mainName = req.file.filename;
      dockerFile += 'COPY ' + req.file.filename + ' ./job\n';

    }
    dockerFile += 'EXPOSE 5554\n' +
      'CMD ["npm", "start","job/' + mainName + '"]';
    fs.writeFile(outDir + 'Dockerfile', dockerFile, function (err) {
      if (err) {
        return console.log(err);
      }

      var path = req.file.filename + '.tar';
      exec('tar -cvf  ' + path + ' -C ' + outDir + ' Dockerfile', (err, stdout, stderr) => {
        if (err) {
          // node couldn't execute the command
          console.log(err);
          return;
        }

        exec('tar -rvf  ' + path + ' -C ./uploads/ ' + req.file.filename, (err, stdout, stderr) => {
          if (err) {
            // node couldn't execute the command
            console.log(err);
            return;
          }

          buildImage(path, req.file.filename);
        });
      });

      //buildImage2(outDir, req.file.filename);

      // compressing.gzip.compressFile(outDir + 'Dockerfile', path)
      //   .then(buildImage(path, req.file.filename));
    }
    );



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

app.get("/invoke/:id", async (req, res) => {


  res.sendStatus(200);
});

app.listen(3000, function () {
  console.log("listening on port 3000!");
});
