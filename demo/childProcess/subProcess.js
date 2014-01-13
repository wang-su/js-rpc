/**
 * New node file
 */

/**
 *  随机字符串
 */
var randomStr = function(_len){
    for(var str = "" , len = _len || 10 ; str.length < len ; str += (~~(Math.random() * 36)).toString(36));
    return str;
};


var Jsrpc = require("../../js-rpc.js");
var n = 0;
var name = "N_" + (~~(Date.now() / 1000)).toString(16) + "_" + randomStr();

var myrpc = new Jsrpc();

myrpc.setOutput(function(msg){
    process.send(msg);
});

process.on("message",function(msg){
    myrpc.onData(msg);
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
                console.log("i'm [%s], done!!", name);
                clearInterval(time);
                // 这个setTimeout 就是为了给线程一个写出消息的机会,没其它意义.
                setTimeout(function(){
                    process.exit();
                },100);
            }else{
                console.log("the count on server is %d! , from: [%s]",c,name);
            }
        });
    },500);
});
