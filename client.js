var jf = require('jsonfile');
var mtime = require('microtime.js')
var bodyParser  = require('body-parser');
var app = require('express')();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
app.use(bodyParser.json())

PORT=8080
FPS=30
PLAYERS = {}
cwd=process.cwd()
var playerMask={state:1,sprite:1,x:1,y:1,user:1}
server.listen(PORT,()=>{ console.log(`http://127.0.0.1:${PORT}/`) });

SESSIONS={}// cull older than 1 days
app.get("/welcome",(req,res)=>{
    //request.body.name
    var S=SESSIONS[req.query.s]
    if(!S){res.send("☹");return}
    //request.body.time
	res.sendFile(process.cwd()+'/client.html')	
})
app.get("/",(req,res)=>{
	res.sendFile(process.cwd()+'/login.html')	
})
app.post("/",(req,res)=>{
    if(req.body.pass!="chu"){res.status(403).send("☹");return}
    sid=grid()
    SESSIONS[sid]={name:req.body.name,t:req.body.time}
    res.send("welcome?s="+sid)
})

setInterval( mainloop, 1000/FPS );
function mainloop(){
    UpdatePlayers()
    
}
function UpdatePlayers(){
    loop:
    for(var p in PLAYERS)if(PLAYERS.hasOwnProperty(p)){
        if(!PLAYERS[p]||!PLAYERS[p].CS)continue loop;
        var Dx=0,Dy=0
        if(PLAYERS[p].CS.w)Dy-=0.2
        if(PLAYERS[p].CS.s)Dy+=0.2
        if(PLAYERS[p].CS.a)Dx-=0.2
        if(PLAYERS[p].CS.d)Dx+=0.2
        
        PLAYERS[p].y+=Dy/(Dx?2:1) //Reduce speed on diagonal
        PLAYERS[p].x+=Dx/(Dy?2:1) //Reduce speed on diagonal
    }
    
    var players=PLAYERS.map((v,i,a)=>{return mask(v,playerMask)})
    var maps = varies(PLAYERS,'map')
    for(var m in maps)if(maps.hasOwnProperty(m)){
        var LocalPlayers={}
        maps[m].map((v,i,a)=>{var id=v._id;delete v._id; LocalPlayers[id]=v})
        
    }
         
    io.emit("update",{players})  
}
var default_player_states={
    0:{frames:[{x:0,y:0}]},//idle
    swalk:{frames:[{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0}]},
    awalk:{frames:[{x:0,y:1},{x:1,y:1},{x:2,y:1},{x:3,y:1}]},
    dwalk:{frames:[{x:0,y:2},{x:1,y:2},{x:2,y:2},{x:3,y:2}]},
    wwalk:{frames:[{x:0,y:3},{x:1,y:3},{x:2,y:3},{x:3,y:3}]},
    spin:{frames:[{x:0,y:0},{x:0,y:2},{x:0,y:3},{x:0,y:1}]}
}



io.on('connection', function(socket){
    var SOCKET_PLAYER_ID
    socket.on('disconnect', function(msg){
        console.log(`PLAYER ${SOCKET_PLAYER_ID} QUIT`)
        delete PLAYERS[SOCKET_PLAYER_ID]
    })
    socket.on('login', function(msg){
        console.dir({socket,msg})
        PLAYERS[msg.pid]={sprite:"xmasgirl3",x:2,y:2.5}
        //PLAYERS[msg.pid]={sprite:"weddingguy02",x:2,y:2.5}
        SOCKET_PLAYER_ID=msg.pid
    })
    socket.on('ControlState', function(msg){
        //add auth here soon!
        pid=msg.pid
        delete msg.pid
        
        if(msg.PState!=undefined) {
            PLAYERS[pid].state=msg.PState
            delete msg.PState
        }
        
        PLAYERS[pid].CS=msg
    })
    
    //this will send the map object to the client,
    //automatically populated with all the elements on the 
    //board, including players and npc
    /// Load the file defining the map itself
    socket.on('getmap', function(msg){
        //Check pid has permission for that map id
        var map = jf.readFileSync(process.cwd()+`/data/${msg.id}.map`)
        
        PLAYERS[msg.pid].map=map.id
        LeaveAll(socket)
        socket.join(`map${map.id}`)
        
        var players=where(PLAYERS,{map:map.id})||{}
        players=players.map((v,i,a)=>{return mask(v,playerMask)})
        var sprites={
            'weddingguy02':{
                size:{x:32,y:48},
                states:default_player_states
            },
            'xmasgirl3':{
                size:{x:32,y:48},
                states:default_player_states
            },
            'candyshop':{
                size:{x:32,y:32},
                states:{
                    grass1:{frames:[{x:0,y:0}]},
                    grass2:{frames:[{x:1,y:0}],size:{x:32,y:32}}//size optional on state
                }
            },
        }
        var tiles = {
            0:{sprite:'candyshop.grass1'},
            1:{sprite:'candyshop.grass2'}
        }
        socket.emit('map',{map,players,sprites,tiles})
    });
})   


function LeaveAll(sock){
       var rooms = sock.rooms
       for(var room in rooms) {
           sock.leave(room);
       }   
}



app.get("/sprite/:id",(req,res)=>{
    var s = jf.readFileSync(process.cwd()+`/data/${req.params.id}.sprite`);
    map.players=where(PLAYERS,{map:map.id})||[]
	res.send(JSON.stringify(map))	
})
app.get("/spritesheet/:id",(req,res)=>{
	res.sendFile(process.cwd()+`/data/${req.params.id}.png`)	
})
getFile=(u,file)=>{    app.get(u,(req,res)=>{res.sendFile(file)})  }
getFile("/jq",cwd+'/jquery-3.0.0.min.js')
getFile("/jqm",cwd+'/jquery.mobile.min.js')
getFile("/jqmcss",cwd+'/jquery.mobile.min.css')

//takes an array of objects and an object to match
function where(list, crit){
    o=list.constructor()
    for(var i in list)if(list.hasOwnProperty(i)){
        var l=list[i], match = true
        for(c in crit)if(crit.hasOwnProperty(c))
            match=match&&(l[c]==crit[c])
        if(match)(o.push?o.push(l):o[i]=l)
    }
    return o
}
//any property defined in crit will be passed back
function mask(i,crit){
    o={}
    for(var c in crit)if(crit.hasOwnProperty(c))
        o[c]=i[c]
    return o
}
//similar to [].map
Object.prototype.map=function(f){
    var o = {}
    for(var i in this)if(this.hasOwnProperty(i))
        o[i]=f(this[i])
    return o
}
//index an object or array by the value of a given x property
function varies(o,x){
    out={}
    o.map((v,i,a)=>{
        v._id=i
        var V=v[x]
        if(!out[V])out[V]=[]
        out[V].push(v)        
    })
    return out
}
//random id
function grid(){
    return ~~(Math.random()*(1<<24))
}