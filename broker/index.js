var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;
var routerPort = process.env.ROUTERPORT || 5554;
var zmq = require("zeromq");
var router = zmq.socket('router');
router.identity = "MessageBroker";
var kue = require('kue')
  , queue = kue.createQueue();
  
router.bindSync("tcp://*:"+routerPort);
console.log("MessageBroker listening on "+routerPort);

router.on('message', function () {
  var argl = arguments.length,
    envelopes = Array.prototype.slice.call(arguments, 0, argl - 1),
    message = JSON.parse(Array.prototype.slice.call(arguments, 2, argl - 1).toString('utf8'))
    payload = arguments[argl - 1];
    console.log(message);
    switch(message.MessageType){
      case 201:
        queue.create('evaluation', JSON.stringify(payload))
    }
  console.log(envelopes.toString('utf8'));
  console.log('incoming request: ' + payload.toString('utf8'));

  var header = {
    Identity: 0,
    MessageType: 1,
    ActionType: 201,
    ConfirmId: 0
  };
  router.send([router.identity, '', JSON.stringify(header), JSON.stringify(payload)]);
});


app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});



io.on('connection', function (socket) {
  socket.on('chat message', function (msg) {
    io.emit('chat message', msg);
  });
});

http.listen(port, function () {
  console.log('listening on *:' + port);
});