const io = require('socket.io-client');
const host = process.env.HOST || "localhost";
const socket = io('http://'+host+':4000');
socket.on('connect', () => {
  console.log('Successfully connected!');
});
socket.on("jobfinished", function(data){
  console.log(data);
  
});