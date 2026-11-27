import type {RecordSet} from "../../../packages/game-engine/rewards.mjs";
export type Progress={records:Record<string,RecordSet>;sessions:Record<string,{found:number[];wrong:number;used:boolean;elapsed:number}>};
export const empty=():Progress=>({records:{},sessions:{}});
function db():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open("pd3-progress",1);r.onupgradeneeded=()=>r.result.createObjectStore("state");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
export async function load():Promise<Progress>{const d=await db();try{return await new Promise((resolve,reject)=>{const r=d.transaction("state").objectStore("state").get("progress");r.onsuccess=()=>resolve(r.result??empty());r.onerror=()=>reject(r.error)})}finally{d.close()}}
export async function save(p:Progress){const d=await db();try{await new Promise<void>((resolve,reject)=>{const tx=d.transaction("state","readwrite");tx.objectStore("state").put(p,"progress");tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}finally{d.close()}}
