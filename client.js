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
	res.sendFile(process.cwd()+`/data/${req.params.id}.png`)	
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

var last_players=""
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
    var str_players=JSON.stringify(players)
    if(str_players!=last_players){
        io.emit("update",{players}) 
        last_players= str_players
    }
}

var PRESIGNED_URL={}

//TODO: document the protocol as it is now sufficiently complicated
io.on('connection', function(socket){
    var SOCKET_PLAYER_ID
    var PLAYER_CID
    var PLAYER_SPRITE
    var USER
    var SESSION
    
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
        
        var objects = readFileSafe(store,{})
        var oid=grid()
        
        file.x=P.x
        file.y=P.y
        file.w=1
        file.h=1
        file.sprite="candyshop.box"
        
        objects[oid]=file
        jf.writeFileSync(store,objects)
        console.log(`Added file:${file.name} as ${oid} to map ${P.map}`)
        
        io.emit('map',{hard:false,objects})
        
    })
    socket.on('login', function(msg){    
        //msg.sid//is the session id which has the name for USERS[name]
        PLAYER_CID=msg.cid//is the salted bcrypt thereof
        bcrypt.compare(msg.sid+SERVER_KEY,'$2a$'+msg.cid,(err,match)=>{
            if(err){console.log(`BCCE2:${JSON.stringify(err)}`);return;}
            if(!match){console.log(`Suspected bad login: ${msg}`);return}
            
            SESSION=SESSIONS[msg.sid]
            USER=USERS[SESSION.name]
            SOCKET_PLAYER_ID=msg.pid
            PLAYERS[SOCKET_PLAYER_ID]={
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
        if(msg.space){//user is holding action key
            //Let's see if there is anything there for the user to interact with
            var objects = readFileSafe(cwd+`/data/${P.map}.objects.dat`,{})
            var O
            for(var o in objects)if(objects.hasOwnProperty(o)){
                O =objects[o] 
                if(O.x<=P.x && 
                    O.x+O.w>=P.x && 
                    O.y<=P.y && 
                    O.y+O.h>=P.y) break;
                O=undefined
            }
            if(O){//user is over an actionable object
                console.log('obj')
                //check user permissions later...
                setTimeout(()=>{//check back in 2 sec
                    console.log('still holding')
                    if(!PLAYERS[SOCKET_PLAYER_ID].CS.space)return;
                    //user has been holding action key for a while!
                    var aid=grid()+''+grid()+''+grid()
                    PRESIGNED_URL[aid]={data:O.data,pid:SOCKET_PLAYER_ID}                
                    socket.emit('file4u',{url:`/data/${aid}/???`})
                    setTimeout(()=>{//remove the presigned link a while later
                        delete PRESIGNED_URL[aid]
                    },10000)                    
                },2000)
            } else console.log('no obj')
        }
        
        
    })
    
    //this will send the map object to the client,
    //automatically populated with all the elements on the 
    //board, including players and npc
    /// Load the file defining the map itself
    socket.on('getmap', function(msg){
        if(!SOCKET_PLAYER_ID)return;
        
        //Check pid has permission for that map id
        
        
        var map = renderMap(msg.id)
        
        var needTiles=[]
        for(var i in map.tiles)if(map.tiles.hasOwnProperty(i)){
            var ix=needTiles.indexOf(map.tiles[i])
            if(ix+1){
                map.tiles[i]=ix
                continue;
            }
            needTiles.push(map.tiles[i])
            map.tiles[i]=needTiles.length-1
        }
        
        PLAYERS[SOCKET_PLAYER_ID].map=map.id
        LeaveAll(socket)
        socket.join(`map${map.id}`)
        
        var players=where(PLAYERS,{map:map.id})||{}
        players=players.map((v,i,a)=>{return mask(v,playerMask)})
        var sprites=SPRITES
        
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
        
        var objects = readFileSafe(cwd+`/data/${map.id}.objects.dat`,{})
        
        socket.emit('map',{hard:true,map,players,sprites,tiles,objects})
    });
})   

function renderMap(id){
    var map=jf.readFileSync(cwd+`/data/${id}.map`)
    
    switch(map.seed.type){
        case "generate"://This seed is for completely random noise deterministically generated by the seed
            //expand the seed out to a nice size
            fasthash=(s)=>{
                var h = 5381,l = s.length
                while(l) h = (h * 33) ^ s.charCodeAt(--l)
                return h >>> 0
            }
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
function grid(){    return ~~(Math.random()*(1<<24))    }

function readFileSafe(p,elseval){
    return fileExists(p)?jf.readFileSync(p):elseval
}

init()