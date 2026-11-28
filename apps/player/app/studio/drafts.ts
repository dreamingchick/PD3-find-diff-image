import type {Draft} from '../../../../packages/studio-core/index.mjs';
export type StoredImage={name:string;blob:Blob;sha256:string};
export type DraftRecord={key:string;draft:Draft;images:[StoredImage|null,StoredImage|null];updatedAt:number};
export type DraftIndex={key:string;title:string;stageId:string;updatedAt:number};
let queue:Promise<unknown>=Promise.resolve();
function db():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open('pd3-studio',1);r.onupgradeneeded=()=>{r.result.createObjectStore('drafts');r.result.createObjectStore('index')};r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();resolve(r.result)};r.onerror=()=>reject(r.error)})}
export async function listDrafts():Promise<DraftIndex[]>{const d=await db();try{return await new Promise((resolve,reject)=>{const r=d.transaction('index').objectStore('index').getAll();r.onsuccess=()=>resolve((r.result as DraftIndex[]).sort((a,b)=>b.updatedAt-a.updatedAt));r.onerror=()=>reject(r.error)})}finally{d.close()}}
export async function readDraft(key:string):Promise<DraftRecord|undefined>{const d=await db();try{return await new Promise((resolve,reject)=>{const r=d.transaction('drafts').objectStore('drafts').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}finally{d.close()}}
function write(record:DraftRecord|undefined,key:string){const run=queue.catch(()=>{}).then(async()=>{const d=await db();try{await new Promise<void>((resolve,reject)=>{const tx=d.transaction(['drafts','index'],'readwrite');if(record){tx.objectStore('drafts').put(record,key);tx.objectStore('index').put({key,title:record.draft.title,stageId:record.draft.id,updatedAt:record.updatedAt},key)}else{tx.objectStore('drafts').delete(key);tx.objectStore('index').delete(key)}tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error)})}finally{d.close()}});queue=run;return run;}
export const saveDraft=(record:DraftRecord)=>write(record,record.key);
export const deleteDraft=(key:string)=>write(undefined,key);
