var cwd=process.cwd()
var jf = require('jsonfile');
var fs = require('fs');
var mtime = require('microtime.js')
var bodyParser  = require('body-parser');

var app = require('express')();
var mw = require('express').Router();//require() is cached, by the way.

var server = require('http').createServer(app);
var io = require('socket.io')(server);
var bcrypt = require('bcrypt');

app.use(bodyParser.json())
app.use((req,res,next)=>{/*logging*/next();})
app.use(mw)
//404 anything that misses the mw router, 
//all late-comer mw routes will be before this handler
app.use((req,res)=>{res.send("☹");})

var SERVER_KEY
bcrypt.hash(Date.now()+"myServerKey",8,(e,hash)=>{
    if(!e){ SERVER_KEY=hash; return }
    console.log(`Could not init server key, BCrypt error: ${JSON.stringify(e)}`)
    process.exit()
})

PORT=8080
FPS=30
PLAYERS = {}
var playerMask={state:1,sprite:1,x:1,y:1,name:1}
var objectMask={type:1, h:1,w:1,x:1,y:1,sprite:1,name:1,state:1}
var DEFAULT_PLAYER_SPRITE="xmasgirl3"
var default_player_states={
    0:{frames:[{x:0,y:0}]},//idle
    swalk:{frames:[{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0}]},
    awalk:{frames:[{x:0,y:1},{x:1,y:1},{x:2,y:1},{x:3,y:1}]},
    dwalk:{frames:[{x:0,y:2},{x:1,y:2},{x:2,y:2},{x:3,y:2}]},
    wwalk:{frames:[{x:0,y:3},{x:1,y:3},{x:2,y:3},{x:3,y:3}]},
    spin:{frames:[{x:0,y:0},{x:0,y:2},{x:0,y:3},{x:0,y:1}]}
}
var SPRITES=jf.readFileSync(cwd+`/data/sprites.dat`)
var USERS = jf.readFileSync(cwd+`/data/users.dat`)
function init(){
    SPRITES=SPRITES.map((v,i,a)=>{
        if(v.type=='char')v.states=v.states||default_player_states; 
        return v;
    })
}
server.listen(PORT,()=>{ console.log(`http://127.0.0.1:${PORT}/`) });

SESSIONS={}// TODO: cull older than 1 days

mw.get("/bot",(req,res)=>{
	res.sendFile(cwd+'/bot.html')	    
})
mw.get("/welcome",(req,res)=>{
    //as convoluted this is, it makes the url very difficult to interpret at first glance
    var sid
    for(var i in req.query)if(req.query.hasOwnProperty(i)){
        var qi=req.query[i]
        if(qi) sid=qi.split('-')[0]
    }
    //now we have the sid, being the first part of the only query arg, being at [grid()] index
    var S=SESSIONS[sid]
    if(!S){res.send("☹");return}
    //request.body.time
	res.sendFile(cwd+'/client.html')	
})
mw.get("/",(req,res)=>{	    res.sendFile(cwd+`/login.html`)	    })
mw.get("/signup",(req,res)=>{	res.sendFile(cwd+'/signup.html')	})
mw.post("/",(req,res)=>{
    if(!USERS[req.body.name]){//user does not exist. create an account and ask which sprite to use
        bcrypt.hash(req.body.pass, 5, function(err, hash) {
            if(err){res.send(`Unexpected error.`);console.log(`BCEE1:${JSON.stringify(err)}`);return;}
            USERS[req.body.name]={pass:hash}
            jf.writeFileSync(cwd+`/data/users.dat`,USERS)
        });
        res.send(`/signup`)
        return
    }
    u=USERS[req.body.name]
    bcrypt.compare(req.body.pass, u.pass, function(err, match) {
        if(err){res.send(`Unexpected error.`);console.log(`BCCE1:${JSON.stringify(err)}`);return;}
        if(!match){res.status(403).send("☹");return}
        sid=grid()
        SESSIONS[sid]={name:req.body.name,t:req.body.time}
        
        bcrypt.hash(sid+SERVER_KEY, 5, function(err, hash) {
            if(err){res.send(`Unexpected error.`);console.log(`BCEE2:${JSON.stringify(err)}`);return;}
            hash=hash.replace('$2a$','')
            res.send(`welcome?${grid()}=${sid}-${hash}`)
        })
    });
})
mw.get("/sprite/:id",(req,res)=>{
    var s = jf.readFileSync(process.cwd()+`/data/${req.params.id}.sprite`);
    map.players=where(PLAYERS,{map:map.id})||[]
	res.send(JSON.stringify(map))	
})
mw.get("/spritesheet/:id",(req,res)=>{
    var file = (SPRITES[req.params.id]||{}).file
	res.sendFile(process.cwd()+`/data/${file||req.params.id}.png`)	
})
mw.get("/jq",      (req,res)=>{res.sendFile(cwd+'/jquery-3.0.0.min.js')    })
mw.get("/jqm",     (req,res)=>{res.sendFile(cwd+'/jquery.mobile.min.js')   })
mw.get("/jqmcss",  (req,res)=>{res.sendFile(cwd+'/jquery.mobile.min.css')  })
mw.get("/data/:aid/:pid",(req,res,next)=>{
    file=PRESIGNED_URL[req.params.aid]
    if(!file || file.pid!=req.params.pid)return next();
    res.send(file.data)
})

setInterval( mainloop, 1000/FPS );
function mainloop(){
    UpdatePlayers()
}

var playerDelta={}
function UpdatePlayers(){
    loop:
    for(var p in PLAYERS)if(PLAYERS.hasOwnProperty(p)){
        if(!PLAYERS[p]||!PLAYERS[p].CS||!PLAYERS[p].map)continue loop;
        var Dx=0,Dy=0
        var CS=PLAYERS[p].CS
        
        var Speed=0.2, Decay=0.7
        var WASD=mask(PLAYERS[p].CS,{w:1,a:1,s:1,d:1})
        var CSD=WASD.map((v,i,a)=>{
            var d=PLAYERS[p].CSDecay[i]//The decayed val for each btn
            d=v?1:d*Decay
            return (d<0.1)?0:d
        })//Decay and cull any values too small
        
        if(CSD.w)Dy-=Speed*CSD.w
        if(CSD.s)Dy+=Speed*CSD.s
        if(CSD.a)Dx-=Speed*CSD.a
        if(CSD.d)Dx+=Speed*CSD.d
        
        PLAYERS[p].y+=Dy/(Dx?2:1) //Reduce speed on diagonal
        PLAYERS[p].x+=Dx/(Dy?2:1) //Reduce speed on diagonal
        console.dir(CSD)
        PLAYERS[p].CSDecay=CSD    //Set the decaying control state
    
        var store = cwd+`/data/${PLAYERS[p].map}.objects.dat`
        var objects = readFileSafe(store,{})
        
        
        //This will be used for passive interactions, such as enemy hits
        if(PLAYERS[p].CS.space)for(var o in objects)if(objects.hasOwnProperty(o)){
            var O=objects[o]
            if(near(PLAYERS[p],objects[o],0.1) ){
                //console.log(`player ${p} at object ${o}`)
                
                
            }
        }
    }
    
    var players=PLAYERS.map((v,i,a)=>{return mask(v,playerMask)})
    var maps = varies(PLAYERS,'map')
    for(var m in maps)if(maps.hasOwnProperty(m)){
        var LocalPlayers={}
        maps[m].map((v,i,a)=>{LocalPlayers[v]=players[v]})
        
        var str_players=JSON.stringify(LocalPlayers)
        if(playerDelta[m]!=str_players){
            io.sockets.in(`map${m}`).emit("update",{players:LocalPlayers||{}});

            playerDelta[m]=str_players
        }
        
    }
}

var PRESIGNED_URL={}



//TODO: document the protocol as it is now sufficiently complicated
io.on('connection', function(socket){
    var SOCKET_PLAYER_ID //PLAYERS[SOCKET_PLAYER_ID]  
    var PLAYER_CID  //the salted bcrypt of the session id
    var PLAYER_SPRITE  //name
    var USER  //obj
    var SESSION //obj
    var MAP
    
    var cointerval = setInterval(()=>{ //For every player on each map, add a coin in a random position each 10sec
        if(!SOCKET_PLAYER_ID || !MAP)return;
        var P=PLAYERS[SOCKET_PLAYER_ID]
        
        if(!P){ clearInterval(cointerval); return;}
        if(!P.map)return;
        
        var store = cwd+`/data/${P.map}.objects.dat`
        var objects = readFileSafe(store,{})
        if(indexes(objects).length>100)return //prevent flood
        var oid=grid()
        while (objects[oid]) oid = grid() //prevent overwrite
        var x = MAP.x*Math.random()
        var y = (MAP.tiles.length/MAP.x)*Math.random()
        objects[oid]={
            name:'coin',
            sprite:'coin.spin',
            type:'token',
            data:bigrid(),
            x,y,w:1,h:1
        }
        jf.writeFileSync(store,objects)
        io.sockets.in(`map${P.map}`).emit('map',{hard:false,objects})           
    },10000)
    
    socket.on('disconnect', function(msg){
        console.log(`PLAYER ${SOCKET_PLAYER_ID} QUIT`)
        delete PLAYERS[SOCKET_PLAYER_ID]
    })
    socket.on('fileup', function(file){
        if(!SOCKET_PLAYER_ID)return;
        //{file:{name:file.name,type:file.type,data:event.target.result},pid:MY_PLAYER_ID}
        //check SOCKET_PLAYER_ID has upload rights to this map
        
        var P=PLAYERS[SOCKET_PLAYER_ID]
        var store = cwd+`/data/${P.map}.objects.dat`
        
        file.x=P.x
        file.y=P.y
        file.w=1
        file.h=1
        file.sprite="csobj.box"
        
        obj={};obj[grid()]=file;                //WARNING: not overwrite safe!!!!
        var objects = AddToFile(cwd+`/data/${P.map}.objects.dat`,obj)
        
        io.sockets.in(`map${P.map}`).emit('map',{hard:false,objects})
        
    })
    socket.on('login', function(msg){    
        //msg.sid//is the session id which has the name for USERS[name]
        if(msg.bot==12345){
            //TODO: allow bots to join server
        }
        PLAYER_CID=msg.cid//is the salted bcrypt thereof
        bcrypt.compare(msg.sid+SERVER_KEY,'$2a$'+msg.cid,(err,match)=>{
            if(err){console.log(`BCCE2:${JSON.stringify(err)}`);return;}
            if(!match){console.log(`Suspected bad login: ${msg}`);return}
            
            SESSION=SESSIONS[msg.sid]
            USERS[SESSION.name].pocket=fasthash(USERS[SESSION.name].pass)+USERS[SESSION.name].pass.slice(-16)
            USER=USERS[SESSION.name]
            SOCKET_PLAYER_ID=msg.pid
            PLAYERS[SOCKET_PLAYER_ID]={
                CS:{},CSDecay:{w:0,a:0,s:0,d:0},
                sid:msg.sid,
                name:SESSION.name,
                sprite:USER.sprite||DEFAULT_PLAYER_SPRITE,
                x:2,y:2.5}
        })
    })
    
    socket.on('ControlState', function(msg){
        if(!SOCKET_PLAYER_ID)return;
        var P=PLAYERS[SOCKET_PLAYER_ID]
        if(!P){console.log(`No PLAYER: ${SOCKET_PLAYER_ID}`);return}
        
        if(msg.PState!=undefined) {
            P.state=msg.PState
            delete msg.PState
        }
                
        PLAYERS[SOCKET_PLAYER_ID].CS=msg
        
        
        /*
            Download event trigger
        */
        if(msg.space && !PLAYERS[SOCKET_PLAYER_ID].timeout){//user is holding action key and not currently engaging an action
            //Let's see if there is anything there for the user to interact with
            var objects = readFileSafe(cwd+`/data/${P.map}.objects.dat`,{})
            var O, o
            for(o in objects)if(objects.hasOwnProperty(o)){
                O = objects[o] 
                if(near(O,P,0.1)) break;
                O = undefined
            }
            if(O){//user is over an actionable object
                switch(O.type){
                    case 'token':
                        var obj={}; obj[o]=O;
                        var objects=RemoveFromFile(cwd+`/data/${P.map}.objects.dat`,obj)
                        AddToFile(cwd+`/data/${USER.pocket}.pocket.dat`,obj)
                        console.dir({action:'toPocket',pid:USER.pocket,user:SESSION.name,obj})
                        io.sockets.in(`map${P.map}`).emit('map',{hard:false,objects})     
                        
                        break;
                    case 'portal':
                        //this is the map ID the door represents
                        var mid='map'+o
                        
                        PLAYERS[SOCKET_PLAYER_ID].timeout=setTimeout(()=>{//check back in 2 sec
                            if(!near(O,P,0.1))return;
                            //this is the update we make to the player
                            var upd={}
                            upd[SESSION.name]={map:mid}
                            UpdateFile(cwd+`/data/users.dat`,upd)
                            
                            //then we make sure the map exists 
                            var p=cwd+`/data/${mid}.map`
                            if(readFileSafe(p,0)==0){
                                var mapdata={
                                    "id":mid,
                                    "seed":{
                                        "type":"generate",
                                        "value":O.data,
                                        "tiles":["cs.tilewhite1","cs.tilewhite2","cs.tilewhite3"]
                                    },
                                    "width":5,
                                    "startx":10,
                                    "starty":10,
                                    "xpx":32,
                                    "ypx":32
                                }        
                                jf.writeFileSync(p,mapdata)               
                            }
                            GiveMap({id:mid})                                            
                        },2000)
                        break;
                    case 'image/png'://downloads like a normal object, displayed on client
                    case 'object':
                    default:
                        //check user permissions later...
                        PLAYERS[SOCKET_PLAYER_ID].timeout=setTimeout(()=>{//check back in 2 sec
                            if(!near(O,P,0.1))return;
                            console.log('still holding')
                            //user has been holding action key for a while!
                            var aid=grid()+''+grid()+''+grid()
                            PRESIGNED_URL[aid]={data:O.data,pid:SOCKET_PLAYER_ID}                
                            socket.emit('file4u',{x:O.x,y:O.y,type:O.type,url:`/data/${aid}/???`})
                            delete PLAYERS[SOCKET_PLAYER_ID].timeout
                            setTimeout(()=>{//remove the presigned link a while later
                                delete PRESIGNED_URL[aid]
                            },10000)                    
                        },2000)
                        break;
                }
            } else console.log('no obj')
        } else {
            if(PLAYERS[SOCKET_PLAYER_ID].timeout)clearTimeout(PLAYERS[SOCKET_PLAYER_ID].timeout);
            delete PLAYERS[SOCKET_PLAYER_ID].timeout
        }
        if(msg.shift){
            console.dir({USER,SESSION})
            
        }
        
    })
    
    //this will send the map object to the client,
    //automatically populated with all the elements on the 
    //board, including players and npc
    /// Load the file defining the map itself
    var GiveMap=function(msg){
        if(!SOCKET_PLAYER_ID)return;
        
        //Check pid has permission for that map id
        //...
        
        //Set user to that map
        var upd={}
        upd[SESSION.name]={map:msg.id}
        UpdateFile(cwd+`/data/users.dat`,upd)
        
        //cache rendered maps to avoid excessive calculations
        MAP = renderMap(msg.id)
        
        var needTiles=[]
        for(var i in MAP.tiles)if(MAP.tiles.hasOwnProperty(i)){
            var ix=needTiles.indexOf(MAP.tiles[i])
            if(ix+1){
                MAP.tiles[i]=ix
                continue;
            }
            needTiles.push(MAP.tiles[i])
            MAP.tiles[i]=needTiles.length-1
        }
        
        socket.leave(`map${PLAYERS[SOCKET_PLAYER_ID].map}`)
        LeaveAll(socket)
        socket.join(`map${MAP.id}`)
        PLAYERS[SOCKET_PLAYER_ID].map=MAP.id
        
        var players=where(PLAYERS,{map:MAP.id})||{}
        players=players.map((v,i,a)=>{return mask(v,playerMask)})
        
        //Determine who we are talking to, and what tiles they will need to generate their map
        // needTiles=['candyshop.grass1','candyshop.grass2']
        var tiles = {}
        for(var i in needTiles)
            if(needTiles.hasOwnProperty(i))
                tiles[i]={sprite:needTiles[i]}
        // tiles = {
        //     0:{sprite:'candyshop.grass1'},
        //     1:{sprite:'candyshop.grass2'}
        // }
        
        var objects = readFileSafe(cwd+`/data/${MAP.id}.objects.dat`,{})
        objects = objects.map((v,i,a)=>{return mask(v,objectMask)})
        
        socket.emit('map',{hard:true,map:MAP,players,sprites:SPRITES,tiles,objects})
    }
    socket.on('getmap', GiveMap);
})   

function renderMap(id){
    var map=jf.readFileSync(cwd+`/data/${id}.map`)
    
    switch(map.seed.type){
        case "generate"://This seed is for completely random noise deterministically generated by the seed
            //expand the seed out to a nice size
            var o=''
            for(var i in map.seed.value)
                for(var n=0;n<i;n++)
                    o+=fasthash(map.seed.value[i]+i+n)
            
            //determine a square map within the result
            //each character will be 0-9, so we will %8 for our 3 bits per char 
            //to pick from the seed tiles we will need 2^bits≥n where n seed tiles available
            var bs=1//number of bits per tile
            while(bs<30 && Math.pow(2,bs)<map.seed.tiles.length)bs++;
            map.x=~~Math.sqrt(~~(o.length*3/bs))//WARN: ~~ limits to 2<<30   
            
            //Split the hash into []char 
            var ts=o.match(/./g)||[] //protect against match returning null in case s==""
            
            //iterate and as enough bits accumulate, push a tile
            map.tiles=[]
            var bits = 0;
            while(ts.length){
                //get the value of this number
                var V=0, N=(+ts.pop())||0
                for(var i=0;i<3;i++) {//can we use hasOwnProperty on string? it seems to inherit map from obj proto
                    V+=((N >> i) % 2) << bits++
                    //sadly the nice & method does not allow shifting bits into next tile
                    //if we have enough bits, push a tile and reset counters
                    if(bits>=bs){
                        bits=0
                        V=V%map.seed.tiles.length
                        var tile=map.seed.tiles[V]
                        V=0
                        map.tiles.push(tile)
                        if(map.tiles.length>=(map.x*map.x)){ts=[];break;}//rather than break gen;
                    }
                }
            }
            //We're (finally) done here.        
        break;
        default:
            console.log("Defaulting on unknown map seed type: "+id);
            return map;
    }
    
    return map
}
function LeaveAll(sock){
       var rooms = sock.rooms
       for(var room in rooms) {
           sock.leave(room);
       }   
}



/*
    helpers
*/

function fileExists(filePath){
    try {
        return fs.statSync(filePath).isFile();
    } catch (err) {
        return false;
    }
}

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
        o[i]=f(this[i],i,this)
    return o
}
//index an object or array by the value of a given x property
//varies({a:m2,n3 b:n:7},'n')//3,7
function varies(o,x){
    out={}
    o.map((v,i,a)=>{
        var V=v[x] //the varying property of v is V
        if(!out[V])out[V]=[]
        out[V].push(i) //out[V] is an array of indexes in o where o[i][x]==V
    })
    return out
}
//random id
function grid(){      return ~~(Math.random()*(1<<24))         }
function bigrid(){    return grid()*grid()+''+grid()*grid()    }

//Expects a and b to have x and y properties. determines if the xy of a is ±near of b.
//If a has .w and .h, those will be used to determine the hitbox, near may also be given.
function near(a,b,dist){
    if(isNaN(a.x)||isNaN(a.y)||isNaN(b.x)||isNaN(b.y)){
        nanor=(v)=>{return isNaN(v)?'NaN':v}
        console.log(`Bad comparison: a{${nanor(a.x)},${nanor(a.y)}} b{${nanor(b.x)},${nanor(b.y)}}`);
        console.dir({a,b})
        return;
    }
    dist=isNaN(dist)?1:dist
    if(
        a.x-dist<=b.x &&
        a.x+dist+(a.w||0)>=b.x && 
        a.y-dist<=b.y &&
        a.y+dist+(a.h||0)>=b.y
    ) return true   
}

function indexes(o){
    res = [];
    for(var i in o)if(o.hasOwnProperty(i))res.push(o);
    return res;
}

function readFileSafe(p,elseval){
    return fileExists(p)?jf.readFileSync(p):elseval
}

function RemoveFromFile(p,map){
       var data=readFileSafe(p,{})
       for(var x in map)if(map.hasOwnProperty(x)) delete data[x];
       jf.writeFileSync(p,data)
       return data
}
function AddToFile(p,map){
       var data=readFileSafe(p,{})
       for(var x in map)if(map.hasOwnProperty(x)) data[x]=map[x];
       jf.writeFileSync(p,data)
       return data
}
//Merges first level properties into file entries. 
//For example, file holds {A:{z:1,y:2}}, input {A:{y:1,x:3},B:{}}
//{A{z1,y1,x3}B{}}
//TODO recursive using merge()
function UpdateFile(p,map){
       var data=readFileSafe(p,{})
       for(var x in map)if(map.hasOwnProperty(x)){
            if(typeof data[x] == "object" && (Array.isArray(map[x])==Array.isArray(data[x]))){
                for(var y in map[x])
                    if(map[x].hasOwnProperty(y))
                        data[x][y]=map[x][y]
            } else {
                data[x]=map[x]
            }
       }
       jf.writeFileSync(p,data)
       return data
}
function merge(a,b,ctr){
    
    
}
function fasthash(s){ //used in deterministic map generation! CoW!
    var h = 5381,l = s.length
    while(l) h = (h * 33) ^ s.charCodeAt(--l)
    return h >>> 0
}


init()