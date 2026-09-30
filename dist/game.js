'use strict';
(() => {
const $ = id => document.getElementById(id), canvas=$('game'), ctx=canvas.getContext('2d');
const GROUND=472, TILE=40, FLAG_TOP=GROUND-285;
const OLEG_DRAW_HEIGHT=94, DOG_HEIGHT=42, SASHA_HEIGHT=64;
const PARK_SPOTS=[1160,1390,1640], TOY_X=2370;
const CROSSINGS=[[880,1060],[2650,2780]], PUDDLES=[[760,840],[2270,2360],[3720,3810]];
const SPRITE_FRAMES={baget:[190,14,1002,1088],sasha:[265,99,551,1369],'sasha-wave':[201,99,615,1370]};
let cityClock=0, crossingActive=-1, trafficHint=-1, splashCooldown=0;
function freshErrands(){return {walk:0,baget:false,sasha:false,toy:false,spots:[false,false,false],parkHint:false,blockedHint:false,askedToy:false,wave:0};}
function freshDog(){return {x:38,y:GROUND-DOG_HEIGHT,face:1,sniff:0,spot:-1,happy:0,pulling:false};}

const LEVELS=[
 {name:'Дорога к Жене',world:4700,flagX:4090,stairsX:3830,castleX:4270,
  holes:[[1360,1480],[2440,2560],[3360,3480]],pipes:[[720,80],[1100,112],[1700,96],[2220,80],[3070,96]],
  blocks:[[340,330,3],[540,280,2],[940,316,3],[1560,330,2],[1900,300,4],[2600,326,3],[2830,282,2],[3570,325,3]],
  enemies:[[520,420,650],[980,870,1050],[1840,1800,2100],[2350,2320,2400],[2790,2620,3000],[3730,3610,3810]],
  coinArcs:[[1270,6,310],[3310,5,300]]},
 {name:'Московские дела',world:5800,flagX:5190,stairsX:4930,castleX:5370,
  holes:[],pipes:[[550,54],[1900,72],[2440,44],[3440,90],[4440,68]],
  blocks:[[350,330,3],[880,308,2],[1830,245,2],[2320,245,3],[3270,315,3],[3730,282,2],[4310,245,3],[4660,325,3]],
  enemies:[],
  coinArcs:[[1200,6,370],[3030,5,320],[4170,5,300]]}
];
let levelIndex=0, level=LEVELS[0], WORLD=level.world, FLAG_X=level.flagX;
let holes=level.holes,pipes=level.pipes;
let errands=freshErrands();
let dog=freshDog(),child={x:60,y:GROUND-SASHA_HEIGHT};
let view=1120,camera=0,time=0,mode='start',score=0,coins=0,lives=3,checkpoint=90;
let player={x:90,y:GROUND-72,w:32,h:72,vx:0,vy:0,grounded:true,face:1,invincible:0};
let enemies=[],blocks=[],pickups=[],particles=[],deathTimer=0,winTime=0;
let flag={grabbed:false,bonus:0,y:FLAG_TOP+10,holdTime:0},resumeMode='playing';

const input={left:false,right:false,jump:false}, sprite={},spriteCache={};
// Keep static geometry and small sprite canvases out of the per-frame allocation path.
let collisionSolids=[],drawingCamera=0,drawingPlayer=player;
// Physics runs at 120 Hz; display frames interpolate positions without changing collisions.
const previousFrame={camera:0,player:{},dog:{},child:{}};
function captureFrame(){previousFrame.camera=camera;Object.assign(previousFrame.player,player);Object.assign(previousFrame.dog,dog);Object.assign(previousFrame.child,child);enemies.forEach(e=>{e.previousX=e.x;});}
function mix(a,b,alpha){return a+(b-a)*alpha;}
function visible(x,w=80){return x+w>=-40&&x<=view+40;}
function prepareSprite(name,im){
 const crop=SPRITE_FRAMES[name]||[0,0,im.naturalWidth,im.naturalHeight];
 const h=name==='oleg'?OLEG_DRAW_HEIGHT:name==='zhenya'?78:name==='baget'?DOG_HEIGHT:SASHA_HEIGHT;
 const cached=document.createElement('canvas');cached.width=Math.ceil(h*crop[2]/crop[3]);cached.height=h;
 const c=cached.getContext('2d');c.imageSmoothingEnabled=false;c.drawImage(im,...crop,0,0,cached.width,h);spriteCache[name]=cached;
}
['oleg','zhenya','baget','sasha','sasha-wave'].forEach(n=>{const im=new Image();im.onload=()=>prepareSprite(n,im);im.src='assets/'+n+'.png'+(n==='zhenya'?'?v=star-pendant':n==='oleg'?'':'?v=family-1');sprite[n]=im;});
function resetWorld(){level=LEVELS[levelIndex];WORLD=level.world;FLAG_X=level.flagX;holes=level.holes;pipes=level.pipes;errands=freshErrands();dog=freshDog();child={x:60,y:GROUND-SASHA_HEIGHT};cityClock=0;crossingActive=trafficHint=-1;splashCooldown=0;flag={grabbed:false,bonus:0,y:FLAG_TOP+10,holdTime:0};resumeMode='playing';blocks=[];pickups=[];particles=[];enemies=[];level.blocks.forEach(([x,y,n])=>{for(let i=0;i<n;i++){blocks.push({x:x+i*TILE,y,w:TILE,h:TILE,q:i===1||n===2,used:false,bump:0});if(i%2===0)pickups.push({x:x+i*TILE+20,y:y-38,taken:false});}});level.enemies.forEach(([x,a,b],i)=>enemies.push({x,y:GROUND-32,w:32,h:32,a,b,vx:i%2?68:-68,alive:true}));level.coinArcs.forEach(([x,n,y])=>{for(let i=0;i<n;i++)pickups.push({x:x+i*40,y:y-Math.sin(i/(n-1)*Math.PI)*65,taken:false});});collisionSolids=solids();}
resetWorld();captureFrame();
function resize(){view=window.innerWidth<=640?560:1120;canvas.width=view;canvas.height=560;ctx.imageSmoothingEnabled=false;}resize();window.addEventListener('resize',resize);
function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),w,h);}
function pixelCloud(x,y,s=1){if(!visible(x,104*s))return;ctx.save();ctx.translate(Math.round(x),y);ctx.scale(s,s);rect(0,15,104,30,'#fff7e9');rect(15,0,28,50,'#fff7e9');rect(40,-9,32,59,'#fff7e9');rect(72,5,20,43,'#fff7e9');rect(8,43,86,8,'#d9e7f2');ctx.restore();}
function hill(x,y,w,h){if(!visible(x-w/2,w))return;ctx.fillStyle='#4dae76';ctx.beginPath();ctx.moveTo(x-w/2,y);for(let i=0;i<=12;i++){const xx=x-w/2+w*i/12, yy=y-h*Math.sin(Math.PI*i/12);ctx.lineTo(Math.round(xx/8)*8,Math.round(yy/8)*8);}ctx.lineTo(x+w/2,y);ctx.fill();rect(x-8,y-h+36,6,15,'#318862');rect(x+28,y-h+66,6,15,'#318862');}
function bush(x,y){if(!visible(x-8,96))return;for(let i=0;i<3;i++){rect(x+i*25,y-26-(i===1?15:0),32,45,'#267750');rect(x+i*25+4,y-28-(i===1?15:0),25,8,'#50b861');}rect(x-8,y-6,96,15,'#267750');}
function brick(x,y,size=TILE,color='#c67648'){rect(x,y,size,size,color);rect(x,y,size,3,'#f4b16b');rect(x,y,3,size,'#e8985b');rect(x,y+size-3,size,3,'#5f3a39');rect(x+size-3,y,3,size,'#5f3a39');rect(x,y+size/2,size,2,'#663e39');rect(x+size/2,y,2,size/2,'#663e39');rect(x+size/4,y+size/2,2,size/2,'#663e39');}
function coin(x,y){const w=8+Math.abs(Math.cos(time*3+x)) * 10;rect(x-w/2,y-14,w,28,'#ad7633');rect(x-w/2+2,y-14,w-4,25,'#ffd15c');rect(x-w/2+4,y-9,3,13,'#fff3a4');}
function pipe(x,h){const y=GROUND-h;rect(x+5,y+20,50,h-20,'#28894e');rect(x+11,y+22,9,h-24,'#9be578');rect(x+23,y+22,17,h-24,'#56c55f');rect(x+49,y+22,6,h-24,'#1d633f');rect(x,y,60,24,'#195c3f');rect(x+3,y+3,54,17,'#56c55f');rect(x+8,y+3,8,17,'#b1ed88');rect(x+47,y+3,7,17,'#2a994e');}
function enemy(e,alpha){const x=mix(e.previousX??e.x,e.x,alpha)-drawingCamera;if(!visible(x,36))return;const y=Math.round(e.y);rect(x+6,y,20,6,'#794839');rect(x+2,y+6,28,6,'#975e44');rect(x,y+12,32,12,'#b4784a');rect(x+4,y+13,8,7,'#fff3d6');rect(x+20,y+13,8,7,'#fff3d6');rect(x+8,y+13,4,7,'#292536');rect(x+20,y+13,4,7,'#292536');rect(x+8,y+24,16,6,'#e7b978');const step=Math.sin(time*12+e.x)>0?2:0;rect(x-2,y+28-step,14,6,'#493443');rect(x+20,y+26+step,14,6,'#493443');}
function castle(){const x=level.castleX-drawingCamera,y=GROUND-208;if(!visible(x-18,230))return;rect(x+5,y+48,178,160,'#e6b685');for(let i=0;i<5;i++)rect(x+5+i*36,y+30,24,30,'#e6b685');for(let row=0;row<8;row++)for(let col=0;col<6;col++){const bx=x+5+col*32+(row%2?16:0);if(bx<x+178){rect(bx,y+54+row*20,29,2,'#b98566');rect(bx,y+54+row*20,2,18,'#b98566');}}rect(x-18,y+84,46,124,'#c89870');rect(x+159,y+84,46,124,'#c89870');for(let i=0;i<3;i++){rect(x-18+i*18,y+69,12,22,'#c89870');rect(x+159+i*18,y+69,12,22,'#c89870');}rect(x+70,y+124,48,84,'#553e48');rect(x+77,y+113,34,14,'#553e48');rect(x+78,y+140,5,68,'#805354');rect(x+46,y+73,14,27,'#594b55');rect(x+127,y+73,14,27,'#594b55');rect(x+90,y-52,4,85,'#e7d6b0');rect(x+94,y-51,46,27,'#ed6b77');ctx.fillStyle='#ffe6cc';ctx.font='17px Arial';ctx.fillText('♥',x+110,y-31);drawStar(x+181,y+139,18);}
function drawCharacter(name,x,y,w,h,face=1,bob=0,tilt=0){
 const im=sprite[name];if(!im.complete||!im.naturalWidth)return;
 const crop=SPRITE_FRAMES[name]||[0,0,im.naturalWidth,im.naturalHeight],sw=h*crop[2]/crop[3];if(!visible(x-sw/2,sw+w))return;
 ctx.save();ctx.translate(x+w/2,y+h+bob);ctx.scale(name==='zhenya'?-face:face,1);if(tilt)ctx.rotate(tilt);
 if(spriteCache[name])ctx.drawImage(spriteCache[name],-sw/2,-h,sw,h);else ctx.drawImage(im,...crop,-sw/2,-h,sw,h);ctx.restore();
}
function polygon(points,color){ctx.fillStyle=color;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();}
function drawStar(x,y,r){
 // An engraving in the existing stone, without a separate background panel.
 ctx.lineJoin='miter';ctx.lineWidth=2;ctx.strokeStyle='#a77958';
 for(const sign of [1,-1]){ctx.beginPath();ctx.moveTo(x,y-sign*r);ctx.lineTo(x+r*.87,y+sign*r*.5);ctx.lineTo(x-r*.87,y+sign*r*.5);ctx.closePath();ctx.stroke();}
}
function onionDome(x,y,r,color,accent){
 const outline=[[x-r*.65,y+18],[x-r,y+6],[x-r*1.08,y-6],[x-r*.9,y-18],[x-r*.55,y-29],[x,y-43],[x+r*.55,y-29],[x+r*.9,y-18],[x+r*1.08,y-6],[x+r,y+6],[x+r*.65,y+18]];
 polygon(outline,color);ctx.save();ctx.beginPath();outline.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py));ctx.closePath();ctx.clip();
 for(let i=-2;i<3;i++)polygon([[x+i*16-24,y+20],[x+i*16-17,y+20],[x+i*16+8,y-43],[x+i*16+1,y-43]],accent);
 ctx.restore();
 rect(x-r,y+16,r*2,5,'#f4d28a');rect(x-2,y-59,4,18,'#ffe0a0');rect(x-7,y-55,14,3,'#ffe0a0');
}
function saintBasils(x,y){if(!visible(x-6,253))return;
 rect(x,y+6,240,90,'#c57b68');rect(x+8,y+31,224,60,'#efdcb9');
 const towers=[[24,0,36,'#50a88b','#eaf2ba'],[72,-26,40,'#e7825e','#ffdc80'],[121,-70,46,'#dd8064','#fff0cf'],[170,-17,38,'#669dc2','#f5dba6'],[215,5,36,'#d6ac51','#f4e8ca']];
 towers.forEach(([dx,dy,w,color,accent],i)=>{
  rect(x+dx-w/2,y+dy,w,96-dy,'#e9c6a1');rect(x+dx-w/2+5,y+dy,w-10,82-dy,i%2?'#c36959':'#ba7560');
  for(let j=0;j<3;j++)rect(x+dx-w/2+7+j*11,y+dy+15,4,46,'#f5dec1');
  rect(x+dx-5,y+dy+56,10,20,'#5b5c70');onionDome(x+dx,y+dy-16,w*.57,color,accent);
 });
 rect(x-6,y+88,253,12,'#ad6554');
}
function kremlinTower(x,y){if(!visible(x,74))return;
 rect(x,y+82,74,130,'#b9645b');rect(x+9,y+42,56,47,'#d68470');rect(x+3,y+79,68,8,'#f3cfab');
 polygon([[x+10,y+42],[x+37,y-23],[x+64,y+42]],'#3e827b');rect(x+34,y-38,6,18,'#d3ba78');
 polygon([[x+37,y-52],[x+41,y-42],[x+53,y-42],[x+44,y-35],[x+47,y-24],[x+37,y-31],[x+27,y-24],[x+30,y-35],[x+21,y-42],[x+33,y-42]],'#d66b60');
 rect(x+15,y+99,44,44,'#e7c28d');rect(x+19,y+103,36,36,'#454858');
 ctx.strokeStyle='#f6d69d';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x+37,y+110);ctx.lineTo(x+37,y+121);ctx.lineTo(x+48,y+126);ctx.stroke();
 rect(x+27,y+165,20,47,'#784c51');for(let j=0;j<4;j++)rect(x+4,y+91+j*28,7,14,'#f1c89b');
}
function moscowBackground(){const camera=drawingCamera;
 for(let i=0;i<22;i++){
  const x=i*105-camera*.12,y=280-(i%4)*20;if(!visible(x,84))continue;
  rect(x,y,84,145,'#96abb9');rect(x+4,y-7,76,7,'#c6c8bc');
  for(let row=0;row<4;row++)for(let col=0;col<5;col++)rect(x+9+col*14,y+16+row*25,6,10,'#d5d6c1');
 }
 const wallY=372;
 for(let x=-camera*.25%44-44;x<view+44;x+=44){
  rect(x,wallY,44,66,'#bd7267');rect(x+2,wallY-12,16,17,'#bd7267');rect(x+26,wallY-12,16,17,'#bd7267');
  for(let r=0;r<3;r++)rect(x,wallY+14+r*18,44,2,'#a86360');
 }
 for(let i=0;i<3;i++){const offset=i*1180-camera*.25;kremlinTower(offset+230,225);saintBasils(offset+590,314);}
 rect(0,438,view,34,'#7faec0');for(let i=0;i<view;i+=66)rect(i-(camera*.4%66),451,37,3,'#b6d2d9');
}
function tree(x,y){if(!visible(x,65))return;rect(x+27,y-100,10,100,'#93705a');rect(x,y-137,65,62,'#52866d');rect(x+11,y-158,43,25,'#66a183');rect(x+5,y-125,56,29,'#407860');}
function drawErrandPlaces(){const camera=drawingCamera;
 const park=1060-camera;
 rect(park,GROUND-12,740,12,'#649766');for(let i=0;i<4;i++)tree(park+35+i*190,GROUND);
 rect(park+50,GROUND-80,7,80,'#7a6759');rect(park+18,GROUND-115,138,42,'#fff0c9');
 ctx.font='bold 16px monospace';ctx.fillStyle='#3f665b';ctx.fillText('ПАРК · БАГЕТ',park+25,GROUND-89);
 rect(park+360,GROUND-39,79,9,'#c79467');rect(park+367,GROUND-29,6,29,'#745f56');rect(park+426,GROUND-29,6,29,'#745f56');
 const school=2800-camera,y=GROUND-175;if(!visible(school-40,400))return;
 rect(school,y,250,175,'#eecf91');rect(school-8,y-14,266,14,'#d9786c');rect(school+9,y+70,232,105,'#98b6b3');
 rect(school+31,y+84,44,41,'#eaf2d7');rect(school+179,y+84,44,41,'#eaf2d7');
 rect(school+50,y+84,5,41,'#79969c');rect(school+198,y+84,5,41,'#79969c');
 rect(school+99,y+80,53,95,'#675c69');rect(school+107,y+89,35,50,'#c2d9d1');rect(school+138,y+145,4,5,'#f3d392');
 rect(school+17,y+16,216,39,'#fff4d5');ctx.font='bold 18px monospace';ctx.fillStyle='#945f60';ctx.fillText('ДЕТСКИЙ САД',school+43,y+42);
 for(let i=0;i<5;i++){rect(school-40+i*22,GROUND-32,7,32,'#fff1cd');rect(school+260+i*22,GROUND-32,7,32,'#fff1cd');}
 rect(school-40,GROUND-24,95,6,'#fff1cd');rect(school+260,GROUND-24,95,6,'#fff1cd');
}
function drawBaget(x,y,face){
 if(x<-80||x>view+80)return;
 const happy=dog.happy>0, sniff=dog.spot>=0;
 const bounce=happy?-Math.abs(Math.sin(dog.happy*13))*9:Math.abs(player.vx)>30&&!sniff?Math.sin(time*17)*1.5:0;
 const handX=drawingPlayer.x-drawingCamera+16,handY=drawingPlayer.y+43;
 ctx.strokeStyle=dog.pulling||sniff?'#d4916b':'#dcc5a0';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(handX,handY);
 if(dog.pulling||sniff)ctx.lineTo(x+24,y+23);else ctx.quadraticCurveTo((handX+x+24)/2,Math.max(handY,y+23)+12,x+24,y+23);ctx.stroke();
 drawCharacter('baget',x,y,40,DOG_HEIGHT,face,bounce,sniff?.12:happy?Math.sin(time*18)*.025:0);
 if(sniff){
  const fontSize=Math.max(14,Math.ceil(11*view/(canvas.clientWidth||view))),labelWidth=Math.ceil(fontSize*4.4)+12;
  const labelX=Math.max(4,Math.min(view-labelWidth-4,Math.round(face>0?x+28-labelWidth:x+12))),labelY=Math.round(y)-fontSize-10;
  rect(labelX,labelY,labelWidth,fontSize+6,'#172239');ctx.font='bold '+fontSize+'px Arial, sans-serif';ctx.fillStyle='#fff8df';ctx.fillText('Нюх-нюх',labelX+6,labelY+fontSize+1);
 }else{ctx.font='bold 10px monospace';ctx.fillStyle='#fff8df';ctx.fillText('БАГЕТ',Math.max(5,x-2),y-12);}
 if(happy){ctx.fillStyle='#ffb0ac';ctx.font='15px Arial';ctx.fillText('♥',x+16,y-23+bounce);}
}
function drawSasha(x,y,face,atSchool=false){
 if(x<-80||x>view+80)return;
 const waving=atSchool&&errands.wave>0;
 if(!atSchool&&player.grounded){ctx.strokeStyle='#f3c29e';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(drawingPlayer.x-drawingCamera+(face>0?2:30),drawingPlayer.y+43);ctx.lineTo(x+(face>0?23:3),y+42);ctx.stroke();}
 drawCharacter(waving?'sasha-wave':'sasha',x,y,26,SASHA_HEIGHT,face,waving?Math.sin(time*9)*.8:0,waving?Math.sin(time*8)*.015:0);
 ctx.font='bold 10px monospace';ctx.fillStyle=atSchool?'#675c69':'#fff8df';ctx.fillText(atSchool?'САША ♥':'САША',Math.max(8,x-15),y-11);
}
function teddy(x,y){if(!visible(x-15,30))return;
 rect(x-10,y+5,20,17,'#b88961');rect(x-13,y-2,8,8,'#b88961');rect(x+5,y-2,8,8,'#b88961');rect(x-9,y,18,15,'#d6ab7c');
 rect(x-4,y+6,3,3,'#3a3541');rect(x+3,y+6,3,3,'#3a3541');rect(x-3,y+10,7,4,'#f2d5a3');rect(x-1,y+10,3,2,'#3a3541');
 rect(x-15,y+15,7,9,'#b88961');rect(x+8,y+15,7,9,'#b88961');rect(x-10,y+23,8,5,'#a37657');rect(x+3,y+23,8,5,'#a37657');rect(x-4,y+16,9,3,'#cf7a7d');
}
function canFinish(){return levelIndex===0||(errands.baget&&errands.toy&&errands.sasha);}
function updateErrands(dt,previousX){
 dog.happy=Math.max(0,dog.happy-dt);errands.wave=Math.max(0,errands.wave-dt);
 const inPark=player.x>=1080&&player.x<=1790;
 if(!errands.baget&&inPark&&player.grounded){
  if(!errands.parkHint){errands.parkHint=true;toast('У Багета три любимых куста. Дайте ему их обнюхать!');}
  if(dog.spot<0){const i=PARK_SPOTS.findIndex((x,i)=>!errands.spots[i]&&Math.abs(player.x-x)<78);if(i>=0){dog.spot=i;dog.sniff=1.1;}}
 }
 dog.pulling=dog.spot>=0||(!errands.baget&&inPark&&cityClock%3<.8&&Math.abs(player.vx)>10);
 const dogTarget=dog.spot>=0?PARK_SPOTS[dog.spot]-15:player.x+(dog.pulling?player.face*38:-player.face*52);
 const dogDelta=dogTarget-dog.x;if(Math.abs(dogDelta)>2)dog.face=Math.sign(dogDelta);
 dog.x+=dogDelta*Math.min(1,dt*8);dog.y+=(Math.min(GROUND-DOG_HEIGHT,player.y+player.h-DOG_HEIGHT)-dog.y)*Math.min(1,dt*12);
 if(dog.spot>=0){
  const spotX=PARK_SPOTS[dog.spot];
  if(player.x>spotX+84){player.x=spotX+84;player.vx=0;}
  if(player.x<spotX-100){dog.spot=-1;dog.sniff=0;}
  else if(player.grounded&&Math.abs(dog.x-(spotX-15))<8){dog.sniff=Math.max(0,dog.sniff-dt);if(dog.sniff===0){errands.spots[dog.spot]=true;dog.spot=-1;dog.happy=.8;sound('coin');
   if(errands.spots.every(Boolean)){errands.baget=true;dog.happy=2;score+=500;checkpoint=1800;sparkle(player.x,player.y,'#fff2bd','БАГЕТ +500');toast('Багет нагулялся! Пора найти Сашиного мишку →');}
  }}
 }
 if(!errands.sasha){child.x+=(player.x-player.face*28-child.x)*Math.min(1,dt*12);child.y+=(Math.min(GROUND-SASHA_HEIGHT,player.y+player.h-SASHA_HEIGHT)-child.y)*Math.min(1,dt*12);}
 if(!errands.askedToy&&errands.baget&&player.x>2030){errands.askedToy=true;toast('Саша потеряла мишку. Посмотри рядом со скамейкой!');}
 if(!errands.toy&&errands.baget&&Math.abs(player.x+16-TOY_X)<43&&player.grounded){errands.toy=true;score+=300;sound('coin');sparkle(TOY_X,GROUND-52,'#fff2bd','МИШКА +300');toast('Мишка найден! Теперь можно в детский сад →');}
 if(!errands.sasha&&player.x>=2820&&player.x<=3015&&player.grounded&&Math.abs(child.x-player.x)<55){
  if(errands.baget&&errands.toy){errands.sasha=true;errands.wave=3;score+=800;checkpoint=3100;sound('coin');sparkle(player.x,player.y,'#fff2bd','САША +800');toast('Саша машет на прощание. Теперь к Жене ♥');}
  else if(!errands.schoolHint){errands.schoolHint=true;toast(!errands.baget?'Сначала погуляйте с Багетом в парке ←':'Мишка остался у скамейки. Вернитесь за ним ←');}
 }
 if(!canFinish()&&player.x>level.stairsX-40){player.x=level.stairsX-40;player.vx=0;if(!errands.blockedHint){errands.blockedHint=true;toast(!errands.baget?'Сначала три куста в парке ←':!errands.toy?'Нужно найти Сашиного мишку ←':'Сначала отведи Сашу в детский сад ←');}}
}
function lightIsGreen(i){return (cityClock+i*2)%8>=5;}
function inPuddle(){return levelIndex===1&&player.grounded&&PUDDLES.some(([a,b])=>player.x+16>a&&player.x+16<b);}
function applyStreetRules(previousX){
 if(crossingActive>=0&&player.x>CROSSINGS[crossingActive][1]+35)crossingActive=-1;
 CROSSINGS.forEach(([a,b],i)=>{
  const stop=a-38;
  if(player.x>stop&&previousX<=stop&&crossingActive!==i){
   if(lightIsGreen(i)){crossingActive=i;trafficHint=-1;}
   else{player.x=stop;player.vx=0;if(trafficHint!==i){trafficHint=i;toast('Красный свет. Дождитесь зелёного, держась за руку.');}}
  }
 });
 if(inPuddle()&&Math.abs(player.vx)>30&&splashCooldown===0){sparkle(player.x+10,GROUND-2,'#a6dff4','·');splashCooldown=.2;}
}
function cityObstacle(x,h,index){
 if(index%2===0){rect(x,GROUND-h,60,10,'#ab795b');rect(x,GROUND-h+15,60,9,'#cda079');rect(x+6,GROUND-h+24,6,h-24,'#545e69');rect(x+48,GROUND-h+24,6,h-24,'#545e69');}
 else{rect(x+4,GROUND-h,7,h,'#6a7281');rect(x+49,GROUND-h,7,h,'#6a7281');rect(x,GROUND-h+6,60,16,'#f2ede0');for(let j=0;j<4;j++)polygon([[x+j*17,GROUND-h+6],[x+j*17+8,GROUND-h+6],[x+j*17-2,GROUND-h+22],[x+j*17-10,GROUND-h+22]],'#dc826a');rect(x+4,GROUND-9,52,5,'#6a7281');}
}
function cityDetails(){const camera=drawingCamera;
 PUDDLES.forEach(([a,b])=>{rect(a-camera,GROUND-4,b-a,7,'#75b6ca');rect(a+8-camera,GROUND-3,b-a-25,2,'#b5e7ed');});
 CROSSINGS.forEach(([a,b],i)=>{
  for(let x=a;x<b;x+=25)rect(x-camera,GROUND,13,18,'#f2efdf');
  const x=a-55-camera,y=GROUND-155;rect(x+15,y+59,5,96,'#586473');rect(x,y,34,72,'#485461');
  for(let j=0;j<3;j++)rect(x+9,y+9+j*20,16,14,j===0&&!lightIsGreen(i)?'#ed8674':j===2&&lightIsGreen(i)?'#a9dc9d':'#68727e');
  ctx.font='bold 10px monospace';ctx.fillStyle='#fff5d9';ctx.fillText(lightIsGreen(i)?'ИДЁМ':'ЖДЁМ',x-3,y-9);
 });
 if(!errands.toy){teddy(TOY_X-camera,GROUND-28);ctx.font='bold 10px monospace';ctx.fillStyle='#fff4d5';ctx.fillText('МИШКА',TOY_X-20-camera,GROUND-42);}
 else if(!errands.sasha)teddy(child.x+20-camera,child.y+28);
 PARK_SPOTS.forEach((x,i)=>{bush(x-32-camera,GROUND-5);ctx.font='bold 12px monospace';ctx.fillStyle=errands.spots[i]?'#fff4bf':'#ffe8a4';ctx.fillText(errands.spots[i]?'✓':String(i+1),x-3-camera,GROUND-53);});
}
function render(alpha=1,simulationCamera=camera){drawingCamera=mix(previousFrame.camera,simulationCamera,alpha);drawingPlayer={...player,x:mix(previousFrame.player.x??player.x,player.x,alpha),y:mix(previousFrame.player.y??player.y,player.y,alpha)};const camera=drawingCamera,hero=drawingPlayer;rect(0,0,view,560,levelIndex===1?'#9fc4e9':'#78aaee');for(let i=0;i<18;i++){const x=i*345-110-camera*.23;pixelCloud(x,86+(i%3)*49,(i%3===0)?.9:.65);}if(levelIndex===1)moscowBackground();if(levelIndex===0)for(let i=0;i<20;i++)hill(i*390+80-camera*.45,GROUND,280+(i%2)*100,80+(i%3)*30);if(levelIndex===0)for(let i=0;i<21;i++)bush(i*260+110-camera*.8,GROUND-4);
for(let x=Math.floor(camera/TILE)*TILE;x<camera+view+TILE;x+=TILE){if(holes.some(([a,b])=>x>=a&&x<b))continue;if(levelIndex===0){for(let y=GROUND;y<560;y+=TILE)brick(x-camera,y);rect(x-camera,GROUND,40,6,'#eeae6f');}else{rect(x-camera,GROUND,40,88,'#9da4aa');rect(x-camera,GROUND,40,5,'#d5d9d6');rect(x-camera,GROUND+47,40,2,'#727e8d');rect(x-camera,GROUND,2,88,'#727e8d');}}
if(levelIndex===1){drawErrandPlaces();cityDetails();}pipes.forEach(([x,h],i)=>{if(!visible(x-camera,60))return;return levelIndex===1?cityObstacle(x-camera,h,i):pipe(x-camera,h);});blocks.forEach(b=>{if(!visible(b.x-camera,40))return;let y=b.y-Math.sin(b.bump*Math.PI)*8;if(b.q&&!b.used){rect(b.x-camera,y,40,40,'#b47a39');rect(b.x-camera+3,y+3,34,34,'#efbf58');rect(b.x-camera+6,y+6,28,2,'#ffe79b');ctx.font='bold 27px monospace';ctx.fillStyle='#9f6636';ctx.fillText('?',b.x-camera+12,y+29);for(const [dx,dy] of [[4,4],[33,4],[4,33],[33,33]])rect(b.x-camera+dx,y+dy,3,3,'#9f6636');}else brick(b.x-camera,y,40,b.used?'#a97a54':'#c67648');});
for(let i=0;i<5;i++)for(let j=0;j<=i;j++)brick(level.stairsX+i*40-camera,GROUND-40-j*40);rect(FLAG_X-camera,FLAG_TOP,5,GROUND-FLAG_TOP);rect(FLAG_X-camera-3,FLAG_TOP-6,11,9,'#ffdc83');rect(FLAG_X+5-camera,flag.y,58,33,'#fff3cc');ctx.font='20px Arial';ctx.fillStyle='#f07c64';ctx.fillText('♥',FLAG_X+19-camera,flag.y+25);
castle();pickups.filter(c=>!c.taken).forEach(c=>visible(c.x-camera,20)&&coin(c.x-camera,c.y));enemies.filter(e=>e.alive).forEach(e=>enemy(e,alpha));
if(levelIndex===1){drawBaget(mix(previousFrame.dog.x??dog.x,dog.x,alpha)-camera,mix(previousFrame.dog.y??dog.y,dog.y,alpha),dog.face);if(!errands.sasha)drawSasha(mix(previousFrame.child.x??child.x,child.x,alpha)-camera,mix(previousFrame.child.y??child.y,child.y,alpha),hero.face);else drawSasha(2935-camera,GROUND-SASHA_HEIGHT,-1,true);}
const princessX=mode==='win'?Math.max(hero.x+52,level.castleX+87-winTime*65):level.castleX+87;
drawCharacter('zhenya',princessX-camera,GROUND-78,43,78,-1);
if(hero.invincible<=0||Math.floor(time*12)%2===0)drawCharacter('oleg',hero.x-camera,hero.y+hero.h-OLEG_DRAW_HEIGHT,hero.w,OLEG_DRAW_HEIGHT,hero.face,hero.grounded&&Math.abs(hero.vx)>30?Math.sin(time*19)*2:0);
particles.forEach(p=>{if(p.text){ctx.font='bold 17px monospace';ctx.fillStyle=p.color;ctx.fillText(p.text,p.x-camera,p.y);}else rect(p.x-camera,p.y,p.size,p.size,p.color);});
if(mode==='start'){ctx.font='bold 14px monospace';ctx.fillStyle='#fff7e5';ctx.fillText('ОЛЕГ',hero.x-camera-6,hero.y+hero.h-OLEG_DRAW_HEIGHT-14);}
}
let audio=null,soundOn=false,lastMusic=0,musicIndex=0;
function note(freq,duration=.12,delay=0,type='square',gain=.055){if(!soundOn||!audio)return;const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime+delay;o.type=type;o.frequency.setValueAtTime(freq,t);g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+duration);}
function sound(kind){if(kind==='jump'){note(280,.13);note(480,.1,.06);}else if(kind==='coin'){note(880,.08);note(1320,.18,.07);}else if(kind==='stomp')note(160,.15);else if(kind==='hurt'){note(180,.2);note(120,.3,.15);}else if(kind==='win')[523,659,784,1047,784,1047].forEach((f,i)=>note(f,.25,i*.18));}
$('sound').addEventListener('click',()=>{soundOn=!soundOn;if(soundOn){const AudioCtor=window.AudioContext||window.webkitAudioContext;if(!AudioCtor){soundOn=false;toast('Звук недоступен в этом браузере');return;}audio=audio||new AudioCtor();audio.resume().catch(()=>{});note(660);}else if(audio)audio.suspend().catch(()=>{});$('sound').setAttribute('aria-pressed',String(soundOn));$('sound').setAttribute('aria-label',soundOn?'Выключить звук':'Включить звук');$('sound').innerHTML=soundOn?'♪':'♪<span class="mute-slash">/</span>';});
let toastUntil=0,jumpBuffer=0,coyote=0,swipeDir=0,swipeUntil=0,swipePointer=null,swipeJumped=false,gestureStart=null,walkButtons=new Map();
function toast(text){$('toast').textContent=text;$('toast').style.display='block';toastUntil=performance.now()+(text.length>48?3500:2400);}
function text(id,value){const e=$(id);if(e.textContent!==value)e.textContent=value;}
function attribute(id,name,value){const e=$(id);if(e.getAttribute(name)!==value)e.setAttribute(name,value);}
function done(id,value){const classes=$(id).classList;if(classes.contains('done')!==value)classes.toggle('done',value);}
function hud(){updateQuestHud();text('score',String(score).padStart(6,'0'));text('coins',String(coins).padStart(2,'0'));text('lives','♥ '.repeat(lives).trim()||'—');attribute('lives','aria-label',lives+' жизни');text('distance',Math.max(0,Math.round((level.castleX+80-player.x)/(level.castleX-10)*100))+'%');}
function clearInput(){input.left=input.right=input.jump=false;swipeDir=0;swipeUntil=0;swipePointer=null;gestureStart=null;walkButtons.clear();jumpBuffer=0;document.querySelectorAll('.pressed').forEach(b=>b.classList.remove('pressed'));}
function overlay(type){$('overlay').classList.remove('hidden');$('shade').classList.remove('hidden');$('pause').disabled=type!=='pause';if(type==='pause'){$('eyebrow').textContent='ПРИКЛЮЧЕНИЕ ПОДОЖДЁТ';$('message').innerHTML='НЕБОЛЬШАЯ<br><span>ПАУЗА</span>';$('description').textContent=levelIndex===1?'Багет, Саша и Женя подождут. Продолжим?':'Женя всё ещё ждёт тебя в замке.';$('play').innerHTML='ПРОДОЛЖИТЬ <span aria-hidden="true">▶</span>';$('start-hint').textContent='Enter или Esc — продолжить';$('state-label').textContent='ПАУЗА';}else if(type==='gameover'){$('eyebrow').textContent='ЭТО ЕЩЁ НЕ КОНЕЦ';$('message').innerHTML='ПОПРОБУЕМ<br><span>ЕЩЁ РАЗ?</span>';$('description').textContent='Замок на месте. Женя ждёт. Попробуй ещё раз.';$('play').innerHTML='ПОПРОБОВАТЬ СНОВА <span aria-hidden="true">▶</span>';$('start-hint').textContent='или нажми Enter';$('state-label').textContent='ПОПРОБУЙ ЕЩЁ РАЗ';}else if(type==='win'){$('eyebrow').textContent=levelIndex===0?'УРОВЕНЬ 1 ПРОЙДЕН · ДАЛЬШЕ МОСКВА':'ДВА УРОВНЯ · ВСЕ ДЕЛА СДЕЛАНЫ';$('message').innerHTML='ТВОЯ ПРИНЦЕССА<br><span>В ЭТОМ ЗАМКЕ.</span>';$('description').textContent=levelIndex===0?'Женя найдена! Впереди прогулка по Москве.':'Багет нагулялся. Саша в садике. Олег и Женя вместе ♥';$('play').innerHTML=(levelIndex===0?'В МОСКВУ · УРОВЕНЬ 2':'С НАЧАЛА · УРОВЕНЬ 1')+' <span aria-hidden="true">▶</span>';$('start-hint').textContent=coins+' монет · '+score+' очков'+(flag.bonus?' · флаг +'+flag.bonus:'')+' · вы вместе';$('state-label').textContent='ОЛЕГ + ЖЕНЯ = ♥';} $('play').focus({preventScroll:true});}
function beginLevel(index,carry=false){
 levelIndex=index;if(!carry){score=coins=0;lives=3;}
 resetWorld();checkpoint=90;player={x:90,y:GROUND-72,w:32,h:72,vx:0,vy:0,grounded:true,face:1,invincible:0};
 camera=0;winTime=0;coyote=0;mode='playing';captureFrame();refreshLevelUi();
 toast(index===1?'Москва! Сначала погуляй с Багетом в парке.':'Женя ждёт в замке. Вперёд!');
}
function start(){
 if(mode==='pause')mode=resumeMode;
 else if(mode==='win')beginLevel(levelIndex===0?1:0,levelIndex===0);
 else beginLevel(levelIndex);
 clearInput();$('overlay').classList.add('hidden');$('shade').classList.add('hidden');$('pause').disabled=false;
 $('pause').textContent='Ⅱ';$('pause').setAttribute('aria-label','Пауза');
 $('state-label').textContent=flag.grabbed?'ФЛАГ +'+flag.bonus+' ОЧКОВ':levelIndex===1?'МОСКОВСКИЕ ДЕЛА':'ПРИКЛЮЧЕНИЕ НАЧАЛОСЬ';
 canvas.focus({preventScroll:true});hud();if(soundOn&&audio)audio.resume().catch(()=>{});
}
function refreshLevelUi(){
 $('edition').textContent='WORLD 1—'+(levelIndex+1)+' · ДЛЯ ДВОИХ';
 $('screen-label').textContent='1—'+(levelIndex+1)+' · '+level.name.toUpperCase();
 $('level-one').setAttribute('aria-pressed',String(levelIndex===0));$('level-two').setAttribute('aria-pressed',String(levelIndex===1));
 $('quests').hidden=levelIndex!==1;
 $('footer-note').innerHTML=levelIndex===1?'На зелёный свет — идём. У кустов — ждём Багета.<br>Найди мишку и отведи Сашу в садик.':'Собирай монетки. Прыгай на врагов.<br>Выше прыжок на флаг — больше очков.';
 canvas.setAttribute('aria-label',levelIndex===1?'Москва: кремлёвские стены и храм Василия Блаженного. Погуляй с Багетом в парке, отведи Сашу в садик и доберись до Жени. Управление стрелками, пробелом или свайпами.':'Пиксельный уровень с монетами, трубами и замком. Управление стрелками, пробелом или свайпами.');
}
function updateQuestHud(){
 if(levelIndex!==1)return;
 text('quest-dog',errands.baget?'✓ Багет нагулялся':'① Багет · кусты '+errands.spots.filter(Boolean).length+'/3');
 text('quest-child',errands.sasha?'✓ Саша в садике':(errands.toy?'② Саша · в садик':'② Саша · найти мишку'));
 text('quest-zhenya',mode==='win'?'✓ Вместе с Женей':'③ К Жене в замок');
 done('quest-dog',errands.baget);done('quest-child',errands.sasha);done('quest-zhenya',mode==='win');
}
[['level-one',0],['level-two',1]].forEach(([id,index])=>$(id).addEventListener('click',()=>{beginLevel(index);startFromSelection();}));
function startFromSelection(){clearInput();$('overlay').classList.add('hidden');$('shade').classList.add('hidden');$('pause').disabled=false;$('pause').textContent='Ⅱ';$('pause').setAttribute('aria-label','Пауза');$('state-label').textContent=level.name.toUpperCase();hud();canvas.focus({preventScroll:true});}
function pause(){if(['playing','flag','castle-walk'].includes(mode)){resumeMode=mode;mode='pause';clearInput();$('pause').textContent='▶';$('pause').setAttribute('aria-label','Продолжить');overlay('pause');}else if(mode==='pause')start();}
$('play').addEventListener('click',start);$('pause').addEventListener('click',pause);
function requestJump(){if(mode==='playing')jumpBuffer=.18;}
window.addEventListener('keydown',e=>{if(e.code==='Enter'&&['start','pause','gameover','win'].includes(mode)&&!(mode==='win'&&winTime<2.3)){e.preventDefault();start();return;}if(e.code==='Escape'||e.code==='KeyP'){e.preventDefault();pause();return;}if(!['ArrowLeft','ArrowRight','ArrowUp','Space','KeyA','KeyD','KeyW'].includes(e.code)||!['playing','dying','flag','castle-walk'].includes(mode))return;e.preventDefault();if(mode==='flag'||mode==='castle-walk')return;if(e.code==='ArrowLeft'||e.code==='KeyA')input.left=true;if(e.code==='ArrowRight'||e.code==='KeyD')input.right=true;if((e.code==='ArrowUp'||e.code==='Space'||e.code==='KeyW')&&!e.repeat)requestJump();});
window.addEventListener('keyup',e=>{if(e.code==='ArrowLeft'||e.code==='KeyA')input.left=false;if(e.code==='ArrowRight'||e.code==='KeyD')input.right=false;if(['ArrowUp','Space','KeyW'].includes(e.code)&&player.vy<-300)player.vy=-300;});
window.addEventListener('blur',()=>{clearInput();if(['playing','flag','castle-walk'].includes(mode))pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&['playing','flag','castle-walk'].includes(mode))pause();});
[['left',-1],['right',1],['jump',0]].forEach(([id,dir])=>{const b=$(id);b.addEventListener('pointerdown',e=>{e.preventDefault();if(mode!=='playing')return;b.setPointerCapture(e.pointerId);b.classList.add('pressed');walkButtons.set(e.pointerId,dir);if(!dir)requestJump();});const release=e=>{walkButtons.delete(e.pointerId);b.classList.remove('pressed');};b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',release);});
canvas.addEventListener('pointerdown',e=>{if(mode!=='playing'||e.pointerType==='mouse')return;e.preventDefault();canvas.setPointerCapture(e.pointerId);swipePointer=e.pointerId;gestureStart={x:e.clientX,y:e.clientY};swipeJumped=false;swipeDir=0;swipeUntil=0;});
canvas.addEventListener('pointermove',e=>{if(e.pointerId!==swipePointer||!gestureStart)return;e.preventDefault();const dx=e.clientX-gestureStart.x,dy=e.clientY-gestureStart.y;if(Math.abs(dx)>16){swipeDir=Math.sign(dx);swipeUntil=Infinity;gestureStart.x=e.clientX;}if(dy<-18&&!swipeJumped){swipeJumped=true;requestJump();}});
canvas.addEventListener('pointerup',e=>{if(e.pointerId!==swipePointer)return;swipePointer=null;gestureStart=null;if(swipeDir)swipeUntil=performance.now()+180;});
function cancelSwipe(){swipePointer=null;gestureStart=null;swipeDir=0;swipeUntil=0;}
canvas.addEventListener('pointercancel',cancelSwipe);canvas.addEventListener('lostpointercapture',()=>{if(swipePointer!==null)cancelSwipe();});
function overlap(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
function solids(){const result=blocks.map(b=>({...b,block:b}));pipes.forEach(([x,h])=>result.push({x,y:GROUND-h,w:60,h}));for(let i=0;i<5;i++)result.push({x:level.stairsX+i*40,y:GROUND-(i+1)*40,w:40,h:(i+1)*40});let x=0;holes.forEach(([a,b])=>{result.push({x,y:GROUND,w:a-x,h:200});x=b;});result.push({x,y:GROUND,w:WORLD-x,h:200});return result;}
function sparkle(x,y,color='#ffdc83',text=null){particles.push({x,y,vx:0,vy:-65,life:.8,color,text,size:5});}
function getCoin(x,y){coins++;score+=100;sound('coin');sparkle(x,y,'#fff2bd','+100');hud();}
function hurt(force=false){if(mode!=='playing'||(!force&&player.invincible>0))return;lives--;hud();sound('hurt');clearInput();mode='dying';deathTimer=.7;player.vx=0;player.vy=-360;player.grounded=false;$('pause').disabled=true;}
function respawn(){if(lives<=0){mode='gameover';overlay('gameover');return;}player.x=checkpoint;player.y=GROUND-player.h;player.vx=player.vy=0;player.grounded=true;player.invincible=2;dog.x=player.x-52;dog.y=GROUND-DOG_HEIGHT;dog.spot=-1;dog.sniff=0;child.x=player.x-28;child.y=GROUND-SASHA_HEIGHT;crossingActive=-1;mode='playing';captureFrame();$('pause').disabled=false;toast(checkpoint>90?'Продолжаем с середины пути!':'Ещё одна попытка. Ты справишься!');}
function grabFlag(){
 if(mode!=='playing'||flag.grabbed||!canFinish())return;
 const height=Math.max(0,Math.min(1,(GROUND-player.y-player.h/2)/(GROUND-FLAG_TOP)));
 flag.bonus=height>=.9?5000:height>=.7?2000:height>=.4?800:height>=.15?400:100;
 flag.grabbed=true;flag.holdTime=0;score+=flag.bonus;
 clearInput();player.x=FLAG_X-player.w+4;player.face=1;player.vx=player.vy=0;player.grounded=false;mode='flag';
 sparkle(FLAG_X+28,Math.max(FLAG_TOP+20,player.y),'#fff2bd','+'+flag.bonus);hud();
 $('state-label').textContent='ФЛАГ +'+flag.bonus+' ОЧКОВ';toast('Флаг! +'+flag.bonus+' очков');
 [523,659,784].forEach((f,i)=>note(f,.2,i*.1));
}
function followCamera(dt){camera+=(Math.min(WORLD-view,Math.max(0,player.x-view*.35))-camera)*Math.min(1,dt*9);}
function win(){if(!canFinish())return;mode='win';clearInput();winTime=0;player.vx=player.vy=0;player.y=GROUND-player.h;score+=1000;hud();$('distance').textContent='♥';$('pause').disabled=true;sound('win');toast('Женя: «Я знала, что ты придёшь!»');}
function update(dt){if(toastUntil&&performance.now()>toastUntil){$('toast').style.display='none';toastUntil=0;}if(mode==='start'||mode==='pause'||mode==='gameover')return;
particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;});particles=particles.filter(p=>p.life>0);blocks.forEach(b=>b.bump=Math.max(0,b.bump-dt*4));
if(mode==='win'){if(levelIndex===1)updateErrands(dt,player.x);winTime+=dt;if(winTime<2.5&&Math.random()<dt*16){particles.push({x:player.x+15+Math.random()*85,y:GROUND-85,vx:Math.random()*30-15,vy:-40-Math.random()*45,life:1.9,color:'#ff8d99',text:'♥',size:6});}if(winTime>=2.5&&$('overlay').classList.contains('hidden'))overlay('win');camera+=(Math.min(WORLD-view,Math.max(0,player.x-view*.46))-camera)*Math.min(1,dt*5);return;}
if(mode==='flag'){
 player.y=Math.min(GROUND-player.h,player.y+165*dt);flag.y=Math.min(GROUND-34,flag.y+165*dt);
 if(levelIndex===1)updateErrands(dt,player.x);
 if(player.y>=GROUND-player.h&&flag.y>=GROUND-34){flag.holdTime+=dt;if(flag.holdTime>=.25){mode='castle-walk';player.grounded=true;}}
 followCamera(dt);return;
}
if(mode==='castle-walk'){
 player.face=1;player.vx=145;player.x=Math.min(level.castleX+35,player.x+player.vx*dt);player.y=GROUND-player.h;
 if(levelIndex===1)updateErrands(dt,player.x);
 followCamera(dt);hud();if(player.x>=level.castleX+35)win();return;
}
if(mode==='dying'){player.vy+=1700*dt;player.y+=player.vy*dt;deathTimer-=dt;if(deathTimer<=0)respawn();return;}
player.invincible=Math.max(0,player.invincible-dt);jumpBuffer=Math.max(0,jumpBuffer-dt);coyote=player.grounded?.1:Math.max(0,coyote-dt);
if(performance.now()>swipeUntil)swipeDir=0;let buttonDir=0;walkButtons.forEach(v=>{if(v)buttonDir=v;});const dir=((input.right?1:0)-(input.left?1:0))||buttonDir||swipeDir;
if(levelIndex===1){cityClock+=dt;splashCooldown=Math.max(0,splashCooldown-dt);}
const speed=inPuddle()?155:285,target=dir*speed;player.vx+=(target-player.vx)*Math.min(1,dt*(dir?16:22));if(dir)player.face=dir;if(jumpBuffer>0&&coyote>0){player.vy=-830;player.grounded=false;coyote=0;jumpBuffer=0;sound('jump');}
const previousX=player.x;const ss=collisionSolids;player.x+=player.vx*dt;player.x=Math.max(0,Math.min(WORLD-player.w,player.x));for(const b of ss){if(overlap(player,b)){if(player.vx>0)player.x=b.x-player.w;else if(player.vx<0)player.x=b.x+b.w;player.vx=0;}}
if(levelIndex===1)applyStreetRules(previousX);
const oldBottom=player.y+player.h;player.vy+=2050*dt;player.y+=player.vy*dt;player.grounded=false;
for(const b of ss){if(!overlap(player,b))continue;if(player.vy>=0){player.y=b.y-player.h;player.vy=0;player.grounded=true;}else{player.y=b.y+b.h;player.vy=0;if(b.block){b.block.bump=1;if(b.block.q&&!b.block.used){b.block.used=true;getCoin(b.x+20,b.y-12);}}}}
for(const e of enemies){if(!e.alive)continue;e.x+=e.vx*dt;if(e.x<e.a){e.x=e.a;e.vx=Math.abs(e.vx);}if(e.x+e.w>e.b){e.x=e.b-e.w;e.vx=-Math.abs(e.vx);}if(!overlap(player,e))continue;if(player.vy>0&&oldBottom<=e.y+12){e.alive=false;player.vy=-500;score+=200;sound('stomp');sparkle(e.x,e.y,'#fff2bd','+200');}else hurt();}
pickups.forEach(c=>{if(!c.taken&&overlap(player,{x:c.x-10,y:c.y-16,w:20,h:32})){c.taken=true;getCoin(c.x,c.y);}});
if(levelIndex===0&&player.x>1990&&checkpoint===90){checkpoint=2000;toast('Половина пути! Здесь можно перевести дух.');$('state-label').textContent='ПОЛПУТИ К ЖЕНЕ';}
if(levelIndex===1&&mode==='playing')updateErrands(dt,previousX);
if(player.y>620)hurt(true);
if(mode==='playing'&&!flag.grabbed&&overlap(player,{x:FLAG_X-3,y:FLAG_TOP-6,w:11,h:GROUND-FLAG_TOP+6}))grabFlag();
if(player.x>=level.castleX+35&&mode==='playing')win();followCamera(dt);hud();
if(soundOn&&audio&&time-lastMusic>.22){const tune=[330,0,392,440,392,330,294,262,0,294,330,392,330,294,262,0];const f=tune[musicIndex++%tune.length];if(f)note(f,.14,0,'triangle',.023);lastMusic=time;}
}
const modelContext=document.modelContext;
if(modelContext&&typeof modelContext.registerTool==='function'){const lifetime=new AbortController();window.addEventListener('pagehide',()=>lifetime.abort(),{once:true});for(const tool of [
{name:'read_adventure_state',title:'Посмотреть состояние приключения',description:'Read the visible platformer state, score, coins, lives and progress toward Zhenya.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute(input){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw new Error('Expected an empty object');return {state:mode,level:levelIndex+1,score,coins,lives,flagBonus:flag.bonus,errands:levelIndex===1?{bagetWalked:errands.baget,bushesVisited:errands.spots.filter(Boolean).length,toyFound:errands.toy,sashaAtKindergarten:errands.sasha,walkPercent:Math.floor(errands.spots.filter(Boolean).length/3*100)}:null,progress:Math.max(0,Math.min(100,Math.round((player.x-90)/(level.castleX-55)*100)))};}},
{name:'pause_adventure',title:'Поставить приключение на паузу',description:'Pause or resume the active game using the same action as the visible pause button.',inputSchema:{type:'object',properties:{paused:{type:'boolean'}},required:['paused'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||typeof input.paused!=='boolean'||Object.keys(input).some(k=>k!=='paused'))throw new Error('paused must be a boolean');if(!['playing','flag','castle-walk','pause'].includes(mode))throw new Error('No active adventure');if((input.paused&&mode!=='pause')||(!input.paused&&mode==='pause'))pause();return {state:mode};}}
]){try{Promise.resolve(modelContext.registerTool(tool,{signal:lifetime.signal})).catch(()=>{});}catch{}}}
refreshLevelUi();
let last=0,accumulator=0;
function frame(now){time=now/1000;if(!last)last=now;accumulator+=Math.min(.08,(now-last)/1000);last=now;while(accumulator>=1/120){captureFrame();update(1/120);accumulator-=1/120;}render(accumulator*120);requestAnimationFrame(frame);}requestAnimationFrame(frame);
})();
