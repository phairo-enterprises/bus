class RecoveredTutorial {
  constructor(){ this.active=false; this.index=0; this.completed=[]; }
  start(state){ this.active=true; this.index=0; this.completed=[]; this.baseline=JSON.parse(JSON.stringify(state)); return this.message(); }
  message(){ return this.active ? `Tutorial ${this.index+1}/${RecoveredTutorial.instructions.length}: ${RecoveredTutorial.instructions[this.index]}` : 'Tutorial complete: recovered desktop controls only. Select TUTORIAL to practice again.'; }
  observe(s){
    if(!this.active)return false; const b=this.baseline;
    const changed=(a,z)=>a.some((v,i)=>Math.abs(v-z[i])>0.001);
    const checks=[
      ()=>s.artifact!==b.artifact,
      ()=>s.spin>b.spin && changed(s.rotation,b.rotation),
      ()=>changed(s.rgb,b.rgb),
      ()=>s.mode==='free' && b.mode!=='free',
      ()=>s.mode==='free' && Math.abs(s.fov-b.fov)>0.1,
      ()=>s.mode==='free' && Math.abs(s.speed-b.speed)>0.001,
      ()=>s.mode==='free' && Math.abs(s.sensitivity-b.sensitivity)>0.000001,
      ()=>s.mode==='free' && Math.abs(s.roll-b.roll)>0.001,
      ()=>s.mode==='free' && s.movement[0]-b.movement[0]>0.1,
      ()=>s.mode==='free' && s.movement[1]-b.movement[1]>0.1,
      ()=>s.mode==='free' && s.movement[2]-b.movement[2]>0.1,
      ()=>s.mode==='bob' && b.mode==='free'
    ];
    if(!checks[this.index]())return false;
    this.completed.push(this.index++);this.baseline=JSON.parse(JSON.stringify(s));
    if(this.index===RecoveredTutorial.instructions.length)this.active=false;
    return true;
  }
}
RecoveredTutorial.instructions=[
 'Select a different artifact with Left/Right arrow or the swipe bar.',
 'Spin it: drag the blank control area below BLUE and above the swipe bar.',
 'Change a RED, GREEN or BLUE value using its +/− control.',
 'Select MODE to enter free camera.',
 'Change FOV with its existing +/− control.',
 'Change SPEED with its existing +/- control.',
 'Change SENSITIVITY with its existing +/- control.',
 'Change ROLL with its existing +/- control.',
 'Move forward/backward: hold W or S briefly.',
 'Strafe sideways: hold A or D briefly.',
 'Move vertically: hold Q or E briefly.',
 'Select MODE to return to the artifact controls.'
];
if(typeof module!=='undefined')module.exports=RecoveredTutorial;
