# JS-RPC
> this is a tools for javascript RPC

## 关于存在
如何复用一个单条通道来实现复杂数据的交互,一直是需要面对的问题,无论是在页面间的postMessage,node多结点及多线程间的通迅,又或是单页面到Server的通迅过程,每次都需要处理多种消息类型的接收,派发.每次都面临着编码,传输,解码,派发的复杂过程,如何提供一个稳定的,可靠的方案并且使用简单,复用容易便成了问题.由于非常怀念很久以前Java开发过程中对WebServer的使用.于是我便开发了这个工具,用于实现javaScript业务方法的发布.使开发人员能无障碍的以符合javascript风格的方式调用远程方法.

## 使用方法
首先获得JS-RPC

	npm install js-rpc

在代码中引入

	var Jsrpc = require("js-rpc");




## Developing


Created with [Nodeclipse v0.4](https://github.com/Nodeclipse/nodeclipse-1)
 ([Eclipse Marketplace](http://marketplace.eclipse.org/content/nodeclipse), [site](http://www.nodeclipse.org))   
