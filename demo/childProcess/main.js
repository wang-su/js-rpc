/**
 * New node file
 */

    var cp = require('child_process');
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

    myrpc.setOutput(function(msg,proc){
        proc.send(msg);
    });
    
    for(var sub, i = 0 ; i<10 ; i++){
        
        sub = cp.fork("./subProcess.js");
        
        sub.on('message',function(msg){
            //console.log("Message:" + msg);
            myrpc.onData(msg,this);
        }.bind(sub));
        
        sub.on("error",function(){
            console.log(arguments);
        });
    }

   