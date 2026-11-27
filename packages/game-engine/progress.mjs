// Local practice progress only. Never use imported records for ranked play.
export const emptyProgress=()=>({records:{},sessions:{}});
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const uint=v=>Number.isSafeInteger(v)&&v>=0;
function entry(v){return object(v)&&['score','elapsed','wrong','hints'].every(k=>uint(v[k]))&&uint(v.stars)&&v.stars<=3;}
export function validateProgress(value){
 if(!object(value)||!object(value.records)||!object(value.sessions))throw Error('Invalid progress');
 const records={},sessions={};
 for(const [key,v] of Object.entries(value.records)){
  if(!/^[\w-]+:(normal|challenge)$/.test(key)||!object(v)||!['first','best','recent'].every(k=>entry(v[k]))||!uint(v.maxStars)||v.maxStars>3||v.maxStars<Math.max(v.first.stars,v.best.stars,v.recent.stars))throw Error('Invalid record');
  records[key]={first:{...v.first},best:{...v.best},recent:{...v.recent},maxStars:v.maxStars};
 }
 for(const [key,v] of Object.entries(value.sessions)){
  if(!/^[\w-]+$/.test(key)||['__proto__','constructor','prototype'].includes(key)||!object(v)||!Array.isArray(v.found)||v.found.length>100||!v.found.every(uint)||new Set(v.found).size!==v.found.length||!uint(v.wrong)||!uint(v.elapsed)||typeof v.used!=='boolean')throw Error('Invalid session');
  sessions[key]={found:[...v.found],wrong:v.wrong,elapsed:v.elapsed,used:v.used};
 }
 return {records,sessions};
}
export function backup(progress){return JSON.stringify({format:'pd3-progress',version:1,progress:validateProgress(progress)},null,2);}
export function restore(text){
 if(text.length>1000000)throw Error('Backup too large');
 const v=JSON.parse(text);
 if(v.format!=='pd3-progress'||v.version!==1)throw Error('Unsupported backup');
 return validateProgress(v.progress);
}
export function stageStars(records,id){return Math.max(records[id+':normal']?.maxStars??0,records[id+':challenge']?.maxStars??0);}
export function totalStars(records,stages){return stages.reduce((n,s)=>n+stageStars(records,s.id),0);}
export function unlocked(records,stages,id){
 const i=stages.findIndex(s=>s.id===id);
 if(i<0)return false;
 const stage=stages[i];
 return (i===0||stageStars(records,stages[i-1].id)>0)&&totalStars(records,stages.slice(0,i))>=(stage.requiredStars??0);
}
export function resumeSession(progress,stage){
 const s=progress.sessions[stage.id];
 if(!s)return undefined;
 // Catalogs can change between QA builds; stale answer IDs must not auto-clear.
 const ids=new Set(stage.answers.map(a=>a.id));
 return {...s,found:s.found.filter(id=>ids.has(id))};
}
