export function evaluate({answers,found,wrong,hints,mode,remaining,cleared}){
 const ids=new Set(found);
 const base=answers.filter(a=>ids.has(a.id)).reduce((s,a)=>s+({easy:500,normal:600,hard:700}[a.difficulty]??500),0);
 const complete=cleared&&answers.length>0&&answers.every(a=>ids.has(a.id));
 const clearBonus=complete?1000:0,accuracyBonus=complete&&wrong===0?500:0,hintBonus=complete&&hints===0?500:0,timeBonus=complete&&mode==="challenge"?Math.max(0,Math.floor(remaining))*10:0;
 return {base,clearBonus,accuracyBonus,hintBonus,timeBonus,score:base+clearBonus+accuracyBonus+hintBonus+timeBonus,stars:complete?(wrong===0&&hints===0?3:hints<=1?2:1):0};
}
export function record(previous,entry){
 const better=!previous||entry.score>previous.best.score||(entry.score===previous.best.score&&entry.elapsed<previous.best.elapsed);
 return {first:previous?.first??entry,best:better?entry:previous.best,recent:entry,maxStars:Math.max(previous?.maxStars??0,entry.stars)};
}
