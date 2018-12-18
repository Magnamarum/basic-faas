"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const cors = require("cors");
// setup
var routerPort = process.env.ROUTERPORT || 5554;
var zmq = require("zeromq");
var router = zmq.socket("router");
router.identity = "MessageBroker";
var kue = require("kue"), queue = kue.createQueue();
router.on("message", function () {
    var argl = arguments.length, envelopes = Array.prototype.slice.call(arguments, 0, argl - 1), message = JSON.parse(Array.prototype.slice.call(arguments, 2, argl - 1).toString("utf8")), payload = arguments[argl - 1];
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
app.get("/", (req, res) => __awaiter(this, void 0, void 0, function* () {
    res.send("");
}));
app.post("/", (req, res) => __awaiter(this, void 0, void 0, function* () { }));
app.listen(3000, function () {
    console.log("listening on port 3000!");
});
//# sourceMappingURL=index.js.map