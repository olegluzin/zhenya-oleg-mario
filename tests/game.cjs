const fs=require('fs'),vm=require('vm'),assert=require('assert');
let clock=0;const elements=new Map(),listeners={};
function el(id){if(!elements.has(id)){const classes=new Set(id==='overlay'||id==='shade'?[]:[]);elements.set(id,{textContent:'',innerHTML:'',style:{},disabled:false,classList:{add(c){classes.add(c)},remove(c){classes.delete(c)},contains(c){return classes.has(c)},toggle(c,on){if(on)classes.add(c);else classes.delete(c)}},events:{},addEventListener(n,f){this.events[n]=f},attributes:{},setAttribute(k,v){this.attributes[k]=v},getAttribute(k){return this.attributes[k]??null},focus(){},setPointerCapture(){},getContext(){return new Proxy({},{get(){return()=>{}}})}});}return elements.get(id);}
const doc={getElementById:el,querySelectorAll(){return []},addEventListener(){}};
const sandbox={document:doc,window:{innerWidth:1120,addEventListener(n,f){listeners[n]=f}},Image:class{constructor(){this.complete=true;this.naturalWidth=335;this.naturalHeight=768}},performance:{now(){return clock}},requestAnimationFrame(){},console,Math};
sandbox.globalThis=sandbox;vm.createContext(sandbox);
const src=fs.readFileSync(require('path').join(__dirname,'../dist/game.js'),'utf8').replace(/\}\)\(\);\s*$/,`globalThis.testAPI={start(){beginLevel(0);startFromSelection();},beginLevel,startFromSelection,pause,lightIsGreen,requestJump,update,input,captureFrame,render,get drawing(){return {camera:drawingCamera,player:{...drawingPlayer}}},get solids(){return collisionSolids},hud,frame,get player(){return player},get dog(){return dog},get child(){return child},get enemies(){return enemies},get blocks(){return blocks},get state(){return {mode,score,coins,lives,checkpoint,flagBonus:flag.bonus,flagY:flag.y,levelIndex,cityClock,errands:{...errands,spots:[...errands.spots]}}},hurt,win};})();`);
vm.runInContext(src,sandbox);const api=sandbox.testAPI;
function tick(sec){for(let i=0;i<Math.round(sec*120);i++){clock+=1000/120;api.update(1/120);}}
api.start();api.player.x=0;const ev=(x,y)=>({pointerType:'touch',pointerId:1,clientX:x,clientY:y,preventDefault(){}});el('game').events.pointerdown(ev(100,200));el('game').events.pointermove(ev(155,200));tick(.2);assert(api.player.x>20,'horizontal swipe moves');el('game').events.pointerup(ev(155,200));tick(1.2);const stopped=api.player.x;tick(.4);assert(Math.abs(api.player.x-stopped)<1,'released swipe stops');
api.start();el('game').events.pointerdown(ev(100,200));el('game').events.pointermove(ev(100,160));tick(.2);assert(api.player.y<300,'upward swipe jumps');el('game').events.pointercancel();
api.start();el('right').events.pointerdown(ev(0,0));el('jump').events.pointerdown({...ev(0,0),pointerId:2});tick(.2);assert(api.player.x>100&&api.player.y<300,'touch buttons work simultaneously');el('right').events.pointerup(ev(0,0));el('jump').events.pointerup({...ev(0,0),pointerId:2});
api.start();tick(.2);assert.equal(api.player.y+api.player.h,472);
api.requestJump();tick(.2);assert(api.player.y<300,'jump should gain height');tick(.8);assert(api.player.grounded,'jump lands');
api.input.right=true;tick(.4);api.input.right=false;assert(api.player.x>170,'arrow movement');
api.pause();const x=api.player.x;tick(1);assert.equal(api.player.x,x,'pause stops movement');api.pause();
api.start();api.player.x=392;api.requestJump();tick(.5);assert.equal(api.state.coins,1,'head-bump question block gives coin');
api.start();const enemy=api.enemies[0];api.player.x=enemy.x;api.player.y=enemy.y-api.player.h-2;api.player.vy=300;api.player.grounded=false;tick(.06);assert(!enemy.alive,'jump on enemy defeats it');assert.equal(api.state.score,200);
api.start();api.player.x=1395;tick(1.5);assert.equal(api.state.lives,2,'fall consumes one life');assert.equal(api.state.mode,'playing','fall respawns');assert.equal(api.player.x,90);
api.hurt(true);tick(1);api.hurt(true);tick(1);assert.equal(api.state.mode,'gameover','3 lives produce game over');
api.start();api.player.x=2010;tick(.1);assert.equal(api.state.checkpoint,2000);
api.player.x=4306;tick(.05);assert.equal(api.state.mode,'win');assert.equal(api.state.score,1000);tick(3);assert(!el('overlay').classList.contains('hidden'),'victory overlay');
// Traverse the real level using only movement and jumps; no altered geometry or immunity.
api.start();let maxX=90,tries=0;
for(let frame=0;frame<18000&&api.state.mode!=='win';frame++){
 if(api.state.mode==='gameover'){tries++;break;}
 if(api.state.mode==='playing'){
  api.input.right=true;
  const p=api.player;
  const dangers=[720,1100,1360,1700,2220,2440,3070,3360,3830,3870,3910,3950,3990];
  const nearby=dangers.some(x=>x-p.x>0&&x-p.x<65);
  const threat=api.enemies.some(e=>e.alive&&e.x-p.x>-5&&e.x-p.x<70);
  if(p.grounded&&(nearby||threat||(p.vx<10&&p.x>150)))api.requestJump();
  maxX=Math.max(maxX,p.x);
 }
 clock+=1000/120;api.update(1/120);
}
console.log(JSON.stringify({mechanics:'passed',traversal:api.state.mode,maxX,lives:api.state.lives,coins:api.state.coins}));
assert.equal(api.state.mode,'win','automated real-level traversal must reach Zhenya');

for(const [height,bonus] of [[0,100],[65,400],[135,800],[220,2000],[275,5000]]){
 api.start();api.player.x=4060;api.player.y=472-api.player.h-height;api.player.vy=0;api.player.grounded=height===0;
 tick(.01);assert.equal(api.state.mode,'flag','contact enters flag animation');assert.equal(api.state.flagBonus,bonus,'height-based flag bonus');assert.equal(api.state.score,bonus,'bonus awarded once');
 api.pause();const frozen=api.player.y,flagY=api.state.flagY;tick(.5);assert.equal(api.player.y,frozen);assert.equal(api.state.flagY,flagY);api.pause();assert.equal(api.state.mode,'flag','pause resumes flag animation');
 tick(.3);assert.equal(api.state.score,bonus,'bonus does not repeat');tick(5);assert.equal(api.state.mode,'win','slide and automatic walk finish level');assert.equal(api.state.score,bonus+1000,'flag and castle bonuses both counted');
}
api.start();assert.equal(api.state.flagBonus,0,'restart clears flag');
api.player.x=3918;api.player.y=472-120-api.player.h;api.player.grounded=true;api.player.vx=285;api.input.right=true;api.requestJump();for(let i=0;i<240&&api.state.mode==='playing';i++)tick(1/120);console.log('Stair jump:',api.state,api.player);assert.equal(api.state.flagBonus,5000,'maximum bonus reachable with a real jump from stairs');
console.log('All flag tiers, one-time scoring, slide, pause/resume, castle walk and replay passed.');

// Level one transitions to Moscow with the campaign score retained.
api.start();api.player.x=4306;tick(.05);tick(3);const prior=api.state.score;el('play').events.click();assert.equal(api.state.levelIndex,1);assert.equal(api.state.score,prior);assert.equal(api.state.mode,'playing');
// Traffic lights stop the family, advance only in play and permit crossing on green.
api.beginLevel(1);api.startFromSelection();api.player.x=830;api.input.right=true;tick(.4);assert.equal(api.player.x,842,'red light stops before the crossing');const trafficClock=api.state.cityClock;api.pause();tick(4);assert.equal(api.state.cityClock,trafficClock,'pause freezes lights');api.pause();api.input.right=true;tick(5.2);assert(api.player.x>900,'green light lets family cross');
// Puddles slow walking without costing a life.
api.beginLevel(1);api.startFromSelection();api.player.x=760;api.input.right=true;tick(.25);assert(api.player.vx<160,'puddle slows walking');assert.equal(api.state.lives,3);
// Moscow objectives cannot be skipped. Each bush needs a real sniffing stop.
api.beginLevel(1);api.startFromSelection();api.player.x=5406;tick(.05);assert.equal(api.state.mode,'playing');assert(api.player.x<5000);
api.player.x=2870;tick(.1);assert(!api.state.errands.sasha,'school cannot complete before the walk and toy');
api.player.x=1100;api.player.y=400;api.player.vx=0;api.player.grounded=true;api.input.right=true;tick(7);api.input.right=false;assert(api.state.errands.baget,'three sniffing stops complete the walk');assert.equal(api.state.errands.spots.filter(Boolean).length,3);assert(!api.state.errands.sasha);
api.player.x=2880;api.player.vx=0;tick(1);assert(!api.state.errands.sasha,'toy is needed before school');
api.player.x=2350;api.player.vx=0;api.player.y=400;api.player.grounded=true;tick(.1);assert(api.state.errands.toy,'lost teddy can be collected');
api.player.x=2880;api.player.vx=0;api.player.y=400;api.player.grounded=true;tick(1);assert(api.state.errands.sasha,'school drop off completes');assert(api.state.errands.wave>0,'Sasha waves goodbye');assert.equal(api.state.checkpoint,3100);const missionScore=api.state.score;tick(.5);assert.equal(api.state.score,missionScore,'mission rewards do not repeat');
api.hurt(true);tick(1);assert.equal(api.player.x,3100);assert(api.state.errands.baget&&api.state.errands.toy&&api.state.errands.sasha,'completed errands survive losing a life');assert(Math.abs(api.child.x-api.player.x)<35,'companions respawn with Oleg');
api.player.x=5160;api.player.y=125;api.player.vy=0;api.player.grounded=false;tick(.01);assert.equal(api.state.mode,'flag');assert.equal(api.state.flagBonus,5000);tick(6);assert.equal(api.state.mode,'win','Moscow flag leads to Zhenya');tick(3);assert(el('description').textContent.includes('Саша в садике'));el('play').events.click();assert.equal(api.state.levelIndex,0);assert.equal(api.state.score,0);
// Traverse Moscow through actual movement, including lights, sniffs, teddy and street obstacles.
api.beginLevel(1);api.startFromSelection();let frameCount=0;
for(;frameCount<22000&&api.state.mode!=='win';frameCount++){
 if(api.state.mode==='gameover')break;
 if(api.state.mode==='playing'){api.input.right=true;const p=api.player;const dangers=[550,1900,2440,3440,4440,4930,4970,5010,5050,5090];const nearby=dangers.some(x=>x-p.x>0&&x-p.x<65);if(p.grounded&&nearby)api.requestJump();}
 clock+=1000/120;api.update(1/120);
}
console.log('Moscow traversal:',api.state,'frames',frameCount);assert.equal(api.state.mode,'win','real movement completes Moscow');assert(api.state.errands.baget&&api.state.errands.toy&&api.state.errands.sasha);assert.equal(api.state.lives,3);
console.log('Campaign, traffic, puddles, sniffing stops, toy, waving, checkpoints and full Moscow traversal passed.');

// Interpolation affects drawing only, keeping collisions and game state exact.
api.start();api.captureFrame();const originalX=api.player.x;api.player.x+=10;api.render(.5);assert.equal(api.drawing.player.x,originalX+5);assert.equal(api.player.x,originalX+10);api.render(1);assert.equal(api.drawing.player.x,api.player.x);
const cachedSolids=api.solids;tick(.2);assert.strictEqual(api.solids,cachedSolids,'static collision geometry is reused');
api.start();el('game').events.pointerdown(ev(100,200));el('game').events.pointermove(ev(180,200));tick(.2);el('game').events.pointermove(ev(150,200));tick(.2);assert(api.player.vx<0,'a small reverse swipe changes direction without crossing the starting point');el('game').events.lostpointercapture();tick(.3);assert(Math.abs(api.player.vx)<2,'lost capture stops touch movement');
api.start();el('game').events.pointerdown(ev(100,200));el('game').events.pointermove(ev(180,200));el('game').events.pointerup(ev(180,200));tick(.4);assert(Math.abs(api.player.vx)<2,'released swipe brakes within 400ms');
console.log('Interpolation, cached collision geometry, swipe reversal and release passed.');

// Render at irregular display intervals while retaining the same fixed physics step.
api.start();api.input.right=true;for(const now of [1,9,18,35,42,59,76,110]){clock=now;api.frame(now);}assert(api.player.x>90);assert(api.drawing.player.x<=api.player.x&&api.drawing.player.x>=api.player.x-3,'display interpolation stays between the last two physics steps');
console.log('Irregular frame timing passed.');
