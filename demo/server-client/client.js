/**
 * New node file
 */

    var net = require('net');
    var Jsrpc = require("../../js-rpc.js");
    var name = "N_" + (~~(Date.now() / 1000)).toString(16);
    
    // 创建对像实例.
    var myrpc = new Jsrpc();
    var worker;
    var conn =  net.connect({port: 9991});
    
    conn.on("data",function(_msg){
        var msg = _msg.toString();
        console.log("onData:" + msg);
        myrpc.onData(msg);
    });
    
    myrpc.setOutput(function(msg){
        conn.write(JSON.stringify(msg),"utf-8");
    });
    
    myrpc.syncPublish(function(){
        
        worker = myrpc.subscribe("TestWorker");
        
        worker.hello(name,function(msg){
            console.log(msg);
        });
        
        worker.reset();
        
        var time = setInterval(function(){
            worker.getCount(function(c){
                if(c >= 100){
                    clearInterval(time);
                    conn.end();
                }else{
                    console.log("the count on server is %d!",c);
                }
            });
        },500);
    });