import { createTagWorld, stepTagWorld, TAG } from './src/utils/tagGame';
const w = createTagWorld();
let g=0; while (w.generation < 50 && g < 50*TAG.POP*10) { stepTagWorld(w,0.12,4); g++; }
const base=w.chaserWins+w.evaderWins; let frames=0, warm=false, c0=0,e0=0;
while ((w.chaserWins+w.evaderWins)-base < 70 && frames<50000){
  stepTagWorld(w,0.12,50); frames++;
  if(!warm && (w.chaserWins+w.evaderWins)-base>=30){ warm=true; c0=w.chaserWins; e0=w.evaderWins; }
}
const c=w.chaserWins-c0, e=w.evaderWins-e0;
console.log(`balanceAdj=${w.balanceAdj.toFixed(3)} EMA=${w.chaserWinEMA.toFixed(2)} | 40 ván sau warmup: KAI ${c}-${e} ALBERT = ${Math.round(c/(c+e||1)*100)}%`);
