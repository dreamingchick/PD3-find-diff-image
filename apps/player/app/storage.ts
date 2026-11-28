import {emptyProgress,validateProgress} from "../../../packages/game-engine/progress.mjs";
import {awardFirstClear,exchangeHint,spendStockHint} from "../../../packages/game-engine/economy.mjs";
import {record} from "../../../packages/game-engine/rewards.mjs";
import type {Entry} from "../../../packages/game-engine/rewards.mjs";
import type {Grant} from "../../../packages/game-engine/economy.mjs";
import type {Progress,Session} from "../../../packages/game-engine/progress.mjs";
export type {Progress,Session};
export const empty=emptyProgress;
let queue:Promise<unknown>=Promise.resolve(),channel:BroadcastChannel|undefined;
function bus(){try{if(typeof BroadcastChannel!=="undefined")return channel??(channel=new BroadcastChannel("pd3-progress"))}catch{}return undefined}
function db():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open("pd3-progress",1);r.onupgradeneeded=()=>r.result.createObjectStore("state");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function edit<T>(change:(p:Progress)=>{progress:Progress;value:T},notify=true,recover=false):Promise<{progress:Progress;value:T}>{
 const run=queue.catch(()=>{}).then(async()=>{
  const d=await db();
  try{return await new Promise<{progress:Progress;value:T}>((resolve,reject)=>{
   const tx=d.transaction("state","readwrite"),store=tx.objectStore("state"),read=store.get("progress");
   let result:{progress:Progress;value:T},failure:unknown;
   read.onsuccess=()=>{try{
    let old:Progress;try{old=validateProgress(read.result??empty())}catch(error){if(!recover)throw error;old=empty()}
    const next=change(old);
    const revision=old.revision+Number(notify);if(!Number.isSafeInteger(revision))throw Error("Revision overflow");
    result={progress:validateProgress({...next.progress,revision}),value:next.value};store.put(result.progress,"progress");
   }catch(error){failure=error;tx.abort()}};
   tx.oncomplete=()=>{if(notify){try{bus()?.postMessage("changed")}catch{}}resolve(result)};
   tx.onerror=()=>reject(failure??tx.error);tx.onabort=()=>reject(failure??tx.error??Error("Storage aborted"));
  })}finally{d.close()}
 });queue=run;return run;
}
export async function load(){return (await edit(p=>({progress:p,value:undefined}),false)).progress}
export function subscribe(listener:()=>void){const b=bus();b?.addEventListener("message",listener);return()=>b?.removeEventListener("message",listener)}
export async function replaceProgress(p:Progress){const validated=validateProgress(p);return (await edit(()=>({progress:validated,value:undefined}),true,true)).progress}
export async function saveSession(id:string,s:Session){return (await edit(p=>{
 const old=p.sessions[id],session=old?.attemptId===s.attemptId?{...s,used:s.used||old.used,hints:Math.max(s.hints,old.hints),wrong:Math.max(s.wrong,old.wrong),elapsed:Math.max(s.elapsed,old.elapsed)}:s;
 return {progress:{...p,sessions:{...p.sessions,[id]:session}},value:undefined};
})).progress}
export async function commitClear(id:string,mode:string,entry:Entry):Promise<{progress:Progress;value:Grant}>{return edit(p=>{
 if(!["normal","challenge"].includes(mode)||entry.stars<1)throw Error("Clear required");
 const key=id+":"+mode,records={...p.records,[key]:record(p.records[key],entry)},reward=awardFirstClear(p.wallet,id),sessions={...p.sessions};
 if(mode==="normal")delete sessions[id];
 return {progress:{...p,records,sessions,wallet:reward.wallet},value:reward.grant};
})}
export async function buyHint(){return edit(p=>{const result=exchangeHint(p.wallet);return {progress:{...p,wallet:result.wallet},value:result.ok}})}
export async function commitHint(id:string,mode:string,s:Session,source:"free"|"stock"){
 return edit<{ok:boolean;reason?:"stale"|"empty"}>(p=>{
  if(mode==="normal"){
   const current=p.sessions[id];
   if(!current||current.attemptId!==s.attemptId||current.hints!==s.hints||current.used!==s.used)return {progress:p,value:{ok:false,reason:"stale"}};
  }
  if((source==="free"&&s.used)||(source==="stock"&&!s.used))return {progress:p,value:{ok:false,reason:"stale"}};
  const spent=source==="stock"?spendStockHint(p.wallet):{wallet:p.wallet,ok:true};
  if(!spent.ok)return {progress:p,value:{ok:false,reason:"empty"}};
  const sessions=mode==="normal"?{...p.sessions,[id]:{...s,used:true,hints:s.hints+1}}:p.sessions;
  return {progress:{...p,wallet:spent.wallet,sessions},value:{ok:true}};
 });
}
