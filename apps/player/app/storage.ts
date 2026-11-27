import {emptyProgress,validateProgress} from "../../../packages/game-engine/progress.mjs";
export type {Progress} from "../../../packages/game-engine/progress.mjs";
import type {Progress} from "../../../packages/game-engine/progress.mjs";
export const empty=emptyProgress;
function db():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open("pd3-progress",1);r.onupgradeneeded=()=>r.result.createObjectStore("state");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
export async function load():Promise<Progress>{const d=await db();try{return await new Promise((resolve,reject)=>{const r=d.transaction("state").objectStore("state").get("progress");r.onsuccess=()=>{try{resolve(validateProgress(r.result??empty()))}catch(e){reject(e)}};r.onerror=()=>reject(r.error)})}finally{d.close()}}
export async function save(p:Progress){const d=await db();try{await new Promise<void>((resolve,reject)=>{const tx=d.transaction("state","readwrite");tx.objectStore("state").put(p,"progress");tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}finally{d.close()}}
