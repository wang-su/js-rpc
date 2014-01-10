/**
 * 生成远程RCP代理, 尽可提供一种无端障碍的调用方式, 在调用时应尽量使用无状态的REST风格方法;
 * 设计过程借鉴WebServices中WSDL与SOAP相关思想,但不使用XML做为交换格式.而是使用JSON.
 * 
 * 整个的实现,不考虑传输方式,如TCP,HTTP,WebSocket,线程间通迅等,所以操作内容以JSON对像为目标
 * 
 * 基本执行过程: 
 * 
 *  1 为一个对像创建代理方法 
 *  2 序列化对所创建的代理对像为方法调用描述 
 *  3 传输这段描述内容到远端.
 *  4 在远端根据描述内容创建一个代理对像.供调用者使用.
 *  
 * 在执行的过程中,两端是采用对等结构的,而不存在明确的client端与server端,这表明在server端上,也可以根据一条与client的通路,
 * 创建一个在client上发布的对像代理来调用在client端上执行内容.即Server可主动调用Client端内容.
 * 
 * 存在限制为,不能传输活动对像如SOCKET,DOM等内容,只能描述数据内容.
 * 方法的发布过程中.只能发布一层方法.不能发布多层.如生产活动对像的工厂的方法.
 * 
 * 由于NODE的异步特性,所有方法需要使用一个callback方法用于返回数据.需要将该内容放至于参数列表的最后.
 * 
 * 创建代理对像时,建议提供Description对像,用于对方法的传入和传出进行精准的描述.
 * 
 * 受Javascript弱类型的影响,可以不需要像WSDL中一样定义类型和结构,可以直接使用除function以外的各种数据类型,
 * 即string,number,boolean,array,object等, array与object所包含的所有内容必须可以正确的序列化为JSON格式.
 * 
 * 除此外,补充 error { name:"" , message:"" , stack:"" } 与 blob {content:"",length:"",type:"hex"}
 * 
 * 如果考虑验证条件等则可能需要详细定义,但是暂时不提供.
 * 
 * Description 用于描述接口,结构如下:
 * 
 * {
 *      // 接口名称
 *      Name:"name",
 *      // 方法定义, 这里的input理论上只需要个数,但是为了后续便于验证,所以直接给出类型,output要求类型的理由机上
 *      // 同时,由于在两端采用callback方式,所以是支持多参数的返回的,因此Output也是一个参数列表.
 *      Methods:{
 *          "MethodName1":{Input:[string,number,boolean],Output:[error,object]}
 *          "MethodName2":{Input:[string,boolean],Output:[error,string]}
 *          "MethodName3":{Input:[number,boolean],Output:[error,blob]}
 *          "MethodName4":{Input:[number,boolean]}
 *      }
 *      // 这里为了便于后续扩展,如定义常量,复杂的结构类型,验证关系,传输限制参数等.
 *      // 暂时不考虑实现,但是预留位置,防止变列结构引发的问题.
 *      Types:{
 *          error : { name : "" , message : "" , stack : "" },
 *          blob  : { content : "" , length : "" , type : "hex"}
 *      }
 * }
 * 
 * Message用于描述通迅内容,固定字段名,结构如下:
 * 
 * {
 *      Type:"Call"|"Callback"|"Notify" // 调用类型 Call 表示调用, Notify 表示单向通知调用,不需要返回. Callback 表示方法返回结果.
 *      SN:"",                          // 调用序号,用于标识通信顺序, Call,Notify累加值,每次加1, Callback为对应请求的序号
 *      Name:"",                        // 接口名称
 *      MethodName:"MethodName",        // 方法名称
 *      Body:[],                        // 输入参数,使用一个array,注意内容与Methods定义的Input结构相同.
 * }
 * 
 */

/**
 *  随机字符串
 */
var randomStr = function(_len){
    for(var str = "" , len = _len || 10 ; str.length < len ; str += (~~(Math.random() * 36)).toString(36));
    return str;
};

var defaultInput = function(len){
    for(var arr = [], i = len -1; arr.length < i;arr.push("object"));
    return arr;
};


var DefaultTypes = {
      error : { name : "" , message : "" , stack : "" },
      blob  : { content : "" , length : "" , type : "hex"}
};

function Agent(_src,_description,_name){
    var me = this;
    var src = _src || false;
    var name = _name;   // 如果提供description时,是没有用的,将以_description中的值为准
    var description = me.description = _description || false;
    var methods = (description && description.Methods) || false;
    
    if(methods){
        /**
         * 提供描述的情况下,直接根据描述创建代理对像.
         */
        for(var key in methods){
            if((method = src[key]) instanceof Function){
                me[key] = (function(src,method){
                    return function(){
                        method.apply(src,arguments);
                    };
                })(src,method);
            }
        }
    }else{
        /**
         * 未提供描述的情况下,扫描方法, 根据默认规则创建一个描述内容.
         */
        description = me.description = {Name:name};
        methods = description.Methods = {};
        
        var method = null , parlen = 0;
        for(var key in src){
            
            // 以下划线开头的,认为是内部方法或对像,直接忽略
            if(key[0] == "_"){
                continue;
            }
            /*
             * 
             * 由于需要在线程间通导,所以生成的方法,全为异步方法.
             * 
             */
            if((method = src[key]) instanceof Function){
                /*
                 * function生成代理方法.并创建方法描述,
                 * 这里根据n = function.length做为判断依据, 规则如下:
                 *  
                 *  n = 0 无参数也无传出的通知方法.
                 *  n = 1 无参数但有返回值.
                 *  n > 1 有n - 1个对像参数, 最后一个为callback. 由于这个callback无法检则参数列表, 
                 *        所以认为有两个参数,第一个为错误对像,第二个为数据对像.
                 *        
                 *  由于以上判断方式,所以可见,这里不支持可变参数.
                 *  
                 */
                switch(parlen = method.length || 0){
                    case 0 :
                        methods[key] = {
                            Input:[]
                        };
                        break;
                    case 1 :
                        methods[key] = {
                            Input:[],
                            Output:['error','object']
                        };
                        break;
                    default:
                        methods[key] = {
                            Input:defaultInput(parlen),
                            Output:['error','object']
                        };
                }
                
                me[key] = (function(src,method){
                    return function(){
                        method.apply(src,arguments);
                    };
                })(src,method);
            }else{
                /*
                 * 非function,生成get方法. set方法建议由原始对像自己实现.例如有些属性不应该被改变
                 */
                me[getterName(key)] = (function(src,key){
                    return function(cb){
                        cb && cb(src[key]);
                    };
                })(src,key);
            }
        };
    }
    
}

Agent.prototype = {
    valueOf:function(){
        return this.description;
    },
    toString:function(){
        return JSON.stringify(this.description);
    }
};

var arraySlice = Array.prototype.slice;
/**
 * 
 * 创建一个代理方法,
 *  
 * 创建方法最终将注册callback到writer上,并等待返回.
 * 
 * @param name {string} 接口对像的名称
 * @param methodName {string} 方法的名称
 * @param _input {Array}  传入参数列表
 * @param _output {Array} 传出参数列表
 * @param _types {Object} 类型定议
 * @param writer {Object} 出口对像
 */
var makeMethodAgent = function(name , methodName , _input , _output , _types , writer){
    
    _input  =  _input  || [];
    _output =  _output || false;
    
    // 附加默认类型
    for(key in DefaultTypes){
        _types[key] = DefaultTypes[key];
    }
    
    return function(){
        
        var args = arraySlice.call(arguments,0), len = args.length;
        var cb = args.pop() , err = null , type , arg;
        
        var message = {
                Type : _output ? "Call" : "Notify",
                SN   : 0,
                Name : name,
                MethodName : methodName,
                Body : args
        };
        
        /**
         * 这里不再强制要求参数个数一样,从而可以支持可变长的参数列表. 这样更符合JS的编程习惯.
         * 
         * 同时根据一般开发习惯, 通常参数无论多余或少于,但如果指明参数的情况下通常应固定类型与作用.
         * 
         * 所以这里检测明确提供的参数类型不应有差距.
         * 
         * 例如声明函数 function(string,number,boolean,cb){}
         * 
         * 调用时可以允许以下情况,
         *  1 全部缺失,只提供cb,
         *  2 缺失boolean,但提供cb
         *  3,缺失number与boolean,但提供cb
         *  4 提供参数超出列表,如提供string,number,boolean,array,object,cb,
         *  
         *  * 根据以上规则,强制要求最后一个参数为可执行的回调function
         *   
         */
        
        // 各种参数检查
        if(!(cb instanceof Function)){
            throw new Error("callback is not a function");
        }
        
//        if(args.length != _input.length){
//            err = new Error("lost argumetns,need " + _input.length + " , find " + args.length +", the description is [" + _input.join(',') + "]");
//        }else{
            for(var index in args){
                type = typeof(arg = args[index]);
                
                // 处理数组属于对像类型的特例
                if(type == "object" && Array.isArray(arg)){
                    type = 'array';
                }
                
                // 这里如果index超过_input的声明,则始终忽略判断.
                if(_input[index] && type != _input[index]){
                    
                    if(type == "object"){
                        
                        // TODO 判断复杂对像类型, 暂时没管, 直接认为是正确的...To me : 实现时注意这里只应该产出错误 
                        
                        /*
                         * ......
                         * 
                         * ......
                         * 
                         */
                        
                        // 特殊转换Error对像,因为Error对像的JSON化只能得到空的花括号
                        if(_input[index] == "error"){
                            args[index] = {
                                name:arg.name || "Error" , 
                                message:arg.message || "error" ,
                                stack:arg.stack || ""
                            };
                        }
                    }else{
                        err = new Error("argumetns,type error, need " + _input[index] +" , find " + type);
                        break;
                    }
                }
            }
//        }
        
        // 处理参数查查的错误通知
        if(err){
            if(_output && _output[0] == 'error'){
                cb(err);
            }else{
                throw err;
            }
            return;
        }
        
        // ===========  end 参数检查 ============
        
        // 传出调用消息.
        writer.send(message,cb);
    };
};

var FrontAgent = function(description,writer){
    if(!description || !writer){
        return false;
    }
    var me = this, methods = description.Methods , types = description.Types || {} , name = description.Name;
    var method;
    
    for(var key in methods){
        method = methods[key];
        me[key] = makeMethodAgent(name, key, method.Input,method.Output,types , writer);
    }
};

/**
 * 创建一个可以工作在一个通道上的RPC_Agent.
 */
var RPC_Channel = function(){
    
    this.SRC_RPC_MAP = {};      // 以当前端为源的RPC池,即"被调用者"
    this.DST_RPC_MAP = {};      // 以远端为源的RPC池,即"调用者
    this.waitingHelloAck = [];
    this.writeTimer = null;
    this.writeInterval = 10;    // 写出动作间隔
    this.writeLimit = 10;    // 写出动作间隔
    this.writeBuffer = [];      // 缓存输出动作.
    this.waitingCallback = {};  // 等待回调
    this.SN = 1;                // 当前通迅的通信序号.每次加1,从1开始,因为懒得判断0
};

RPC_Channel.prototype = {
        
        /**
         * 远程RCP代理对像
         * 
         * @param object
         *      将要被代理原始对像,要求所有方法都为异步方法, 并且最后一个
         *      
         * @param description
         *      一个可被代理的结构定义,用来描述方法的调用过程.
         *      
         * @param name
         *      可选的名字,如果不提供,将默认生成一个由当前时间加十位随机字符串的名称
         *      
         * @returns
         */
        publish : function ( obj, description, _name ){
            var name = _name || (~~(Date.now()/1000)).toString(16)  + randomStr(10);
            var agent = new Agent(obj , description , name);
            this.SRC_RPC_MAP[name] = agent;
            return agent;
        },
        subscribe:function(name){
            var description;
            if(description = this.DST_RPC_MAP[name]){
                return (dst = new FrontAgent(description,this));
            }else{
                return null;
            }
        },
        valueOf:function(){
            var obj = {} , srcs = this.SRC_RPC_MAP;
            for(var key in srcs){
                obj[key] = srcs[key].valueOf();
            }
            return obj;
        },
        toString:function(){
            return  JSON.stringify(this.valueOf());
        },
        /**
         * 
         * @param descriptions
         */
        __restore_dst : function(descriptions){
            var me = this , dstMap = me.DST_RPC_MAP , item , name;
            for(var i in descriptions){
                item = descriptions[i];
                if((name = item.Name) && name.length){
                    dstMap[name] = item;
                }else{
                    console.warn("ignored the description that have not name, " ,JSON.stringify(item));
                }
            }
            for(;me.waitingHelloAck.length > 0; me.waitingHelloAck.pop()());
        },
        /**
         * 写出动作
         */
        __write:function(connArgs){
            
            if(this.writeBuffer.length == 0){
                this.writeTimer = null;
                return;
            }
            
            this.write(this.writeBuffer.splice(0,this.writeLimit),connArgs);
            this.writeTimer = setTimeout(this.__write.bind(this,connArgs), this.writeInterval);
        },
        /**
         * 派发消息
         * @param msg
         */
        __receiveMsg:function(msg,connArgs){
            var me = this;
            var item,src, sn, name, methodName, execute , body;
            for(var i in msg){
                
                item = msg[i];
                sn = item.SN, name = item.Name, methodName= item.MethodName, body = item.Body;
                if(sn && name && methodName && body){
                    switch(item.Type){
                        case "Call":
                            body.push((function(sn,name,methodName,me,connArgs){
                                return function(){
                                    // TODO 可能需要检查回传的参数; 暂时未处理,按正确处理.
                                    me.send({
                                        Type : 'Callback',
                                        SN   : sn,
                                        Name : name,
                                        MethodName : methodName,
                                        Body : arraySlice.call(arguments,0)
                                    },connArgs);
                                };
                            })(sn,name,methodName,me,connArgs));
                        case "Notify":
                            src = me.SRC_RPC_MAP[name];
                            if(src && (execute = src[methodName])){
                                execute.apply(src,body);
                            }
                            break;
                        case "Callback":
                            if(execute = me.waitingCallback[sn]){
                                execute.apply(null,body);
                            }
                            break;
                        default:
                            console.warn("Ignored the message, Unknow Type:" + itemType);
                    }
                }else{
                    console.warn("Lost part of message" , JSON.stringify(msg));
                }
            }
        },
        /**
         * 
         * 供FrontAgent对像写出数据用.
         * 
         * @param msg
         * @param cb
         */
        send:function(msg,cb,connArgs){
            var me = this;
            var SN;
            
            if(msg.Type == "Callback"){
                SN = msg.SN;
            }else{
                SN = msg.SN = this.SN++;
            }
            
            if(msg.Type == "Call"){
                if(cb){
                    this.waitingCallback[SN] = cb;
                }else{
                    console.warn("Lost the callback, for Message, Name:[%s]  Method:[%s] ,SN:[%s]" ,msg.Name,msg.MethodName,msg.SN);
                }
            }
            
            this.writeBuffer.push(msg);
            
            if(this.writeTimer == null)
                this.writeTimer = setTimeout(me.__write.bind(me,connArgs), me.writeInterval);
        },
        /**
         * 接到数据后根据类型进行首次的派发
         * 
         * @param msg {string | object}
         */
        onData:function(msg,connArgs){
            debugger;
            // console.log("on message,",msg);
            msg = typeof(msg) == "object"  ? msg : JSON.parse(msg);
            /**
             * 这里接受两种类型. 所有消息通信内容为Array, 控制通信内容为Object
             */
            if(Array.isArray(msg)){
                this.__receiveMsg(msg,connArgs);
            }else if(msg.echo){
                this.write(this.toString());
            }else{
                this.__restore_dst(msg);
            }
        },
        /**
         * 设置传出方法.
         * @param fun {function} 接收一个参数. 内容为将传出的内容.
         */
        setOutput : function(fun){
            this.write = fun;
        },
        /**
         * 每调用一次,则尝试同步一次远端的发布,每调用一次,如果远端正常,则一定会给出一次响应.
         * @param cb
         */
        syncPublish:function(cb,connArgs){
            this.waitingHelloAck.push(cb);
            this.write('{"echo":true}',connArgs);
        }
};

module && (module.exports = RPC_Channel);
