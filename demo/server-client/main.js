/**
 * New node file
 */

var net = require('net');
var Jsrpc = require("../../js-rpc.js");

var c = 0;

var worker = {
    hello:function(name,cb){
        cb("hello " + name);
    },
    getCount: function(cb){
        cb(c ++);
    },
    reset:function(){
        c = 0;
    }
};

// 创建对像实例.
var myrpc = new Jsrpc();

myrpc.publish(worker,{
    Name:"TestWorker",
    Methods:{
        hello:{Input:['string'],Output:['string']},
        getCount:{Output:["number"]},
        reset:{},
    }
},"TestWorker");

myrpc.setOutput(function(msg,conn){
    debugger;
    conn.write(JSON.stringify(msg),"utf-8");
});

var server = net.createServer(function(){
    console.log('server runing..');
});

server.listen(9991 ,function() {
    address = server.address();
    console.log("opened server on %j", address);
});

server.on("connection",function(socket){
    console.log('onConnection');
    socket.on("error",function(_msg){
        console.log("error:" , arguments);
    });
    socket.on("data",function(_msg){
        var msg = _msg.toString();
        console.log("Message:" + msg);
        debugger;
        myrpc.onData(msg,socket);
    });
});

server.on("error",function(){
    console.log(arguments);
});