// Local practice progress only. Imported records never authorize ranked play.
import {initialWallet,awardFirstClear} from './economy.mjs';
export const emptyProgress=()=>({version:2,revision:0,records:{},sessions:{},wallet:initialWallet()});
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const uint=v=>Number.isSafeInteger(v)&&v>=0;
const stageId=v=>typeof v==='string'&&/^[\w-]{1,80}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
const entry=v=>object(v)&&['score','elapsed','wrong','hints'].every(k=>uint(v[k]))&&uint(v.stars)&&v.stars<=3;
const copyEntry=v=>({score:v.score,stars:v.stars,elapsed:v.elapsed,wrong:v.wrong,hints:v.hints});
export function validateProgress(value){
 if(!object(value)||!object(value.records)||!object(value.sessions))throw Error('Invalid progress');
 const legacy=value.version===undefined&&value.wallet===undefined;
 if(!legacy&&(value.version!==2||!uint(value.revision)))throw Error('Unsupported progress');
 const records={},sessions={};
 for(const [key,v] of Object.entries(value.records)){
  const match=/^(.+):(normal|challenge)$/.exec(key);
  if(!match||!stageId(match[1])||!object(v)||!['first','best','recent'].every(k=>entry(v[k]))||!uint(v.maxStars)||v.maxStars>3||v.maxStars<Math.max(v.first.stars,v.best.stars,v.recent.stars))throw Error('Invalid record');
  records[key]={first:copyEntry(v.first),best:copyEntry(v.best),recent:copyEntry(v.recent),maxStars:v.maxStars};
 }
 for(const [key,v] of Object.entries(value.sessions)){
  if(!stageId(key)||!object(v)||!Array.isArray(v.found)||v.found.length>100||!v.found.every(uint)||new Set(v.found).size!==v.found.length||!uint(v.wrong)||!uint(v.elapsed)||typeof v.used!=='boolean')throw Error('Invalid session');
  const hints=legacy?Number(v.used):v.hints,attemptId=legacy?'legacy-'+key:v.attemptId;
  if(!uint(hints)||(v.used?hints<1:hints!==0)||typeof attemptId!=='string'||!/^[\w-]{1,160}$/.test(attemptId))throw Error('Invalid hint session');
  if(v.contentVersion!==undefined&&(typeof v.contentVersion!=='string'||!/^[a-f0-9]{64}$/.test(v.contentVersion)))throw Error('Invalid content version');
  sessions[key]={found:[...v.found],wrong:v.wrong,elapsed:v.elapsed,used:v.used,hints,attemptId,...(v.contentVersion===undefined?{}:{contentVersion:v.contentVersion})};
 }
 const cleared=[...new Set(Object.entries(records).filter(([,v])=>v.maxStars>0).map(([key])=>key.split(':')[0]))];
 let wallet;
 if(legacy){
  wallet=initialWallet();for(const id of cleared)wallet=awardFirstClear(wallet,id).wallet;
 }else{
  const w=value.wallet;
  if(!object(w)||!['coins','xp','hints'].every(k=>uint(w[k]))||!Array.isArray(w.claimed)||!w.claimed.every(stageId)||new Set(w.claimed).size!==w.claimed.length||w.claimed.length!==cleared.length||!cleared.every(id=>w.claimed.includes(id)))throw Error('Invalid wallet');
  wallet={coins:w.coins,xp:w.xp,hints:w.hints,claimed:[...w.claimed]};
 }
 return {version:2,revision:legacy?0:value.revision,records,sessions,wallet};
}
export function backup(progress){return JSON.stringify({format:'pd3-progress',version:2,progress:validateProgress(progress)},null,2);}
export function restore(text){
 if(text.length>1000000)throw Error('Backup too large');
 const v=JSON.parse(text);
 if(!object(v)||v.format!=='pd3-progress'||![1,2].includes(v.version))throw Error('Unsupported backup');
 if(v.version===2&&v.progress?.version!==2)throw Error('Invalid v2 backup');
 return validateProgress(v.progress);
}
export function stageStars(records,id){return Math.max(records[id+':normal']?.maxStars??0,records[id+':challenge']?.maxStars??0);}
export function totalStars(records,stages){return stages.reduce((n,s)=>n+stageStars(records,s.id),0);}
export function unlocked(records,stages,id){
 const i=stages.findIndex(s=>s.id===id);if(i<0)return false;
 return (i===0||stageStars(records,stages[i-1].id)>0)&&totalStars(records,stages.slice(0,i))>=(stages[i].requiredStars??0);
}
export function resumeSession(progress,stage){const s=progress.sessions[stage.id];if(!s||(s.contentVersion??'')!==(stage.version??''))return undefined;const ids=new Set(stage.answers.map(a=>a.id));return {...s,found:s.found.filter(id=>ids.has(id))};}
