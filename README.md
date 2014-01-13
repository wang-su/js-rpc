# JS-RPC
> this is a tools for javascript RPC

## 关于存在
如何复用一个单条通道来实现复杂数据的交互,一直是需要面对的问题,无论是在页面间的postMessage,node多结点及多线程间的通迅,又或是单页面到Server的通迅过程,每次都需要处理多种消息类型的接收,派发.每次都面临着编码,传输,解码,派发的复杂过程,如何提供一个稳定的,可靠的方案并且使用简单,复用容易便成了问题.由于非常怀念很久以前Java开发过程中对WebServer的使用.于是我便开发了这个工具,用于实现javaScript业务方法的发布.使开发人员能无障碍的以符合javascript风格的方式调用远程方法.在调用时应尽量使用无状态的REST风格方法;设计过程借鉴WebServices中WSDL与SOAP相关思想,但不使用XML做为交换格式.而是使用JSON.

整个的实现,不考虑传输方式,如TCP,HTTP,WebSocket,线程间通迅等,所以操作内容以JSON对像为目标

基本执行过程: 

- 1.为一个对像创建代理方法 
- 2.序列化对所创建的代理对像为方法调用描述 
- 3.传输这段描述内容到远端.
- 4.在远端根据描述内容创建一个代理对像.供调用者使用.
 
在执行的过程中,两端是采用对等结构的,而不存在明确的client端与server端,这表明在server端上,也可以根据一条与client的通路,
创建一个在client上发布的对像代理来调用在client端上执行内容.即Server可主动调用Client端内容.

存在限制为,不能传输活动对像如SOCKET,DOM等内容,只能描述数据内容.
方法的发布过程中.只能发布一层方法.不能发布多层.如生产活动对像的工厂的方法.

由于NODE的异步特性,所有方法需要使用一个callback方法用于返回数据.需要将该内容放至于参数列表的最后.

创建代理对像时,建议提供Description对像,用于对方法的传入和传出进行精准的描述.

受Javascript弱类型的影响,可以不需要像WSDL中一样定义类型和结构,可以直接使用除function以外的各种数据类型,
即string,number,boolean,array,object等, array与object所包含的所有内容必须可以正确的序列化为JSON格式.

除此外,补充 error { name:"" , message:"" , stack:"" } 与 blob {content:"",length:"",type:"hex"}

如果考虑验证条件等则可能需要详细定义,**但是暂时未提供验证功能.**

整个通信过程依赖于以下两个结构.Description可能需要自定义, Message在运行时由框架生成

Description 用于描述接口,结构如下:

	{
	     // 接口名称
	     Name:"name",
	     // 方法定义, 这里的input理论上只需要个数,但是为了后续便于验证,所以直接给出类型,output要求类型的理由同上
	     // 同时,由于在两端采用callback方式,所以是支持多参数的返回的,因此Output也是一个参数列表.
	     Methods:{
	         "MethodName1":{Input:[string,number,boolean],Output:[error,object]}
	         "MethodName2":{Input:[string,boolean],Output:[error,string]}
	         "MethodName3":{Input:[number,boolean],Output:[error,blob]}
	         "MethodName4":{Input:[number,boolean]}
	     }
	     // 这里为了便于后续扩展,如定义常量,复杂的结构类型,验证关系,传输限制参数等.
	     // 暂时不考虑实现,但是预留位置,防止变列结构引发的问题.
	     Types:{
	         error : { name : "" , message : "" , stack : "" },
	         blob  : { content : "" , length : "" , type : "hex"}
	     }
	}

Message 用于描述通迅内容,固定字段名,结构如下:

	{
		 // 调用类型 Call 表示调用, Notify 表示单向通知调用,不需要返回. Callback 表示方法返回结果.
	     Type:"Call"|"Callback"|"Notify",
		 // 调用序号,用于标识通信顺序, Call,Notify累加值,每次加1, Callback为对应请求的序号 
	     SN:"",  
		 // 接口名称                       
	     Name:"",
		 // 方法名称
	     MethodName:"MethodName",
		 // 输入参数,使用一个array,注意内容与Methods定义的Input结构相同.
	     Body:[],                       
	}

 */

## 使用方法

###首先获得JS-RPC

	npm install js-rpc

以下我们以发布下面这个对像为实例,演示基于网络发布与线程间两种发布途径:

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

**以下为描述这个对像的方法描述:**

	var description  = {
		// 接口的名称
	    Name:"TestWorker",
	    Methods:{
			// 这是一个有输入和输入的方法
	        hello:{
				Input:['string'],
				Output:['string']
			},
			// 这是一个只有输出的方法
	        getCount:{
				Output:["number"]
			},
			// 这是一个没输入也没输出的方法
	        reset:{},
	    }
	}

### Node TCP Server端示例

	var net = require('net');
	var Jsrpc = require("js-rpc");

	// 创建对像实例.
	var myrpc = new RPC_Channel();

	// 发布上面的对像
	myrpc.publish(worker,description,"TestWorker");

	// 创建一个server对像并监听9991端口
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

		// 这里处理接收到的消息.
	    socket.on("data",function(_msg){
	        var msg = _msg.toString();
	        console.log("Message:" + msg);		// dump出消息内容.
			// 由于是Server-client的架构,所以这里的链接对像直接携带在方法参数中.
	        myrpc.onData(msg,socket);
	    });
	});
	
	server.on("error",function(){
	    console.log(arguments);
	});
	
	// 设置消息的传出方法,由于是Server-client的架构,所以这里的链接对像直接携带在方法参数中.
	myrpc.setOutput(function(msg,conn){
	    conn.write(JSON.stringify(msg),"utf-8");
	});


### Node TCP Client端示例:

    var net = require('net');
    var Jsrpc = require("../../js-rpc.js");
    var name = "N_" + (~~(Date.now() / 1000)).toString(16);	// 生成一个随机的名称
    
    // 创建对像实例.
    var myrpc = new Jsrpc() , worker;

	// 连接到本地的9991端口.
    var conn =  net.connect({port: 9991});

	// 处理消息接收    
    conn.on("data",function(_msg){
        var msg = _msg.toString();
        console.log("onData:" + msg);		//dump 消息内容
		// 这里由于只有一个目的端,所以不需要传入连接对像.如果需要区分多个端,请上面参照Server的例子.
        myrpc.onData(msg);
    });
	
	// 消息的出口处理.这里由于只有一个目的端,所以不需要传入连接对像.    
    myrpc.setOutput(function(msg){
        conn.write(JSON.stringify(msg),"utf-8");
    });
    
	// 从Server取得方法的发布内容
    myrpc.syncPublish(function(){
        // 创建一个代理对像,这个对像将具有与Server端发布对像相同的方法名和参数列表.
        worker = myrpc.subscribe("TestWorker");
        
		// 直接调用hello方法, 并输出server端处理后的返回内容. 这个方法具有输入和输出
        worker.hello(name,function(msg){
            console.log(msg);
        });

        // 调用无输入和输出的通知方法
        worker.reset();
        
		// 返复调用一个有输出的方法
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

### Node 线程间示例,主线程

    var cp = require('child_process');
    var Jsrpc = require("../../js-rpc.js");

    // 创建对像实例.
    var myrpc = new Jsrpc();
    
    // 发布上面的对像
	myrpc.publish(worker,description,"TestWorker");
	
	// 传出方法,下面将模似10个线程,所以将传出对像直接带入方法参数
    myrpc.setOutput(function(msg,proc){
        proc.send(msg);
    });
    
    for(var sub, i = 0 ; i<10 ; i++){
        
        sub = cp.fork("./subProcess.js");
        
        sub.on('message',function(msg){
            console.log("Message:" + msg);
			// 将模似10个线程,所以将传出对像直接带入方法参数
            myrpc.onData(msg,this);
        }.bind(sub));
        
        sub.on("error",function(){
            console.log(arguments);
        });
    }

### Node 线程间示例,子线程
	
	var Jsrpc = require("../../js-rpc.js");
	var name = "N_" + (~~(Date.now() / 1000)).toString(16) + "_" + randomStr();	// 生成一个随机的名称
	
	var myrpc = new Jsrpc();
	
	// 输出方法
	myrpc.setOutput(function(msg){
	    process.send(msg);
	});
	
	// 输入方法
	process.on("message",function(msg){
	    myrpc.onData(msg);
	});
	
	// 调用与TCP Client端是基本一样的.除了退出方式
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
	
**其实这个工具只是需要一个输入和输出端处理数据的传入的传出,所以你也可以利用浏览器的postMessage来包装跨域消息.使页面间的方法调用更为舒适.或使用WebSocket,Ajax等让浏览器与服务端的远程调用更为便捷!!**

## API

这个工具并没有太多的API,我也不准备让它更为复杂(或许为了便捷有可能再增加那么少量的几个).现在其实只有下面几个API

### Jsrpc(Constructor) 
构造方法,用于new出一个RCP的通道对像.并且没有参数.

### publish(object,description,name);
用于发布一个对像的方法,重要的内容是description的结构(关于描述的对像结构,你可以在最上面找到),name建议提供并且与description中相同,如果不提供他会随机生成一个字符串.但最终一定会以description中的为准.

**object** : 这是最终的可执行对像,建议使用无状态的方法.

**description** : 描述object的方法. 如果不提供,将生成一个默认的描述,默认将扫描object的属性的方法, 认为所有的方法参数都是object的,并且认为最后一个参数是callback,并且这个callback接收一个err参数与result参数. 同时,还会为所有的属性生成一个get方法.

**name** : 一个字符串值,用于在未提供description时,为扫描生成的对像命名. 在提供description时,是无用的,但是还是建义提供这个参数,并与description中的Name属性相同防止出错.

### subscribe(name) : 
产生一个指定目标的代理对像,唯一的参数是name,请与publish时的name相同.方法会返回一个与你在另一端上发布的对像具有相同调用方法和方法参数.

### syncPublish(callback,connArgs)
从远端取得发布的接口定义, 每调用一次,都将进行一次同步,用于找到在另一端新发布的方法(因为有时候我们并不是一次性发布所有可执行对像).

**callback** : 必须为一个可执行的function

**connArgs** : 连接目标的控制参数.用于指明传出内容的目的端.这个参数将会伴随着需要传出的内容一直到setOutput所设置的方法,这个参数一般用在需要处理多个数据源的情况下,比如server端或多线程开发的主线程端.如果你只有一个连接目标,那么其实可以在所有方法中省略这个参数.**需要注意的是,在某一个端上运行的全部过程中,这个参数要么一直携带,要么从来不带.否则会出现运行异常.**

### onData(data,connArgs)
用于接收数据的方法.

**data** : 远端传来的数据对像,一般为一个JSON(具体格式可以在更上面找到).

**connArgs** : 连接目标的控制参数.用于指明传出内容的目的端.这个参数将会伴随着需要传出的内容一直到setOutput所设置的方法,这个参数一般用在需要处理多个数据源的情况下,比如server端或多线程开发的主线程端.如果你只有一个连接目标,那么其实可以在所有方法中省略这个参数.**需要注意的是,在某一个端上运行的全部过程中,这个参数要么一直携带,要么从来不带.否则会出现运行异常.**

### setOutput(callback)
用于处理数据的传出.

**callback** : 是一个可执行的 function(message,connArgs){..} ,接收两个参数,第一个将参数的内容这个内容是一个未被序列化的Message,如果你的通道能直接传递对像如线程的send方法,那么你就可以直接传出,否则需要序列化为你使用的通道能接受的数据格式,如string或buffer等,第二个控制连接的参数.由onData或syncPublish方法开始一直携带并且不做改变.


Created with [Nodeclipse v0.4](https://github.com/Nodeclipse/nodeclipse-1)
 ([Eclipse Marketplace](http://marketplace.eclipse.org/content/nodeclipse), [site](http://www.nodeclipse.org))   
