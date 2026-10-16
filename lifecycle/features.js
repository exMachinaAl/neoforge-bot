// Feature vector numerik stabil untuk scoring dan dataset ML offline.
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number.isFinite(Number(v))?Number(v):0))
function featureVector(template={},context={},persona={},history={}){
  const t=persona.traits||{},n=persona.needs||{};const hp=context.hp??context.health??20;const food=context.food??20;const threat=context.threatCount??context.hostileCount??0
  const success=Number.isFinite(history.successRate)?history.successRate:(history.count?history.okCount/history.count:.5)
  const avgMs=history.count&&history.totalMs?history.totalMs/history.count:0;const estimate=template.estimatedMs||0
  return{baseWeight:clamp(template.baseWeight??1,0,5),health:clamp(hp/20),food:clamp(food/20),energy:clamp(n.energy??.7),security:clamp(n.security??.5),boredom:clamp(n.boredom??.3),affection:clamp(persona.affection??.5),caution:clamp(t.caution??.5),aggression:clamp(t.aggression??.3),curiosity:clamp(t.curiosity??.5),diligence:clamp(t.diligence??.7),sociability:clamp(t.sociability??.4),threat:clamp(threat/8),players:clamp((context.playerCount||0)/8),rain:context.weather==='rain'||context.isRaining?1:0,thunder:context.weather==='thunder'?1:0,night:['night','dusk'].includes(context.timeOfDay)?1:0,successRate:clamp(success),speedRatio:avgMs&&estimate?clamp(estimate/avgMs,0,2):1,experience:clamp((history.count||0)/100),novelty:1-clamp((history.count||0)/20)}
}
function numericFactors(v){const out={};for(const [k,x] of Object.entries(v||{}))if(Number.isFinite(x))out[k]=+x.toFixed(4);return out}
module.exports={featureVector,numericFactors,clamp}
