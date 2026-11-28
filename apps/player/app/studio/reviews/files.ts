import type {SupabaseClient} from '@supabase/supabase-js';
import {BUCKET,submission,metadata} from '../../../../../packages/studio-core/inbox.mjs';
import type {InboxRow} from '../../../../../packages/studio-core/inbox.mjs';
import {fromDataUrl,decodeImage,dataUrl} from '../images';
import type {LoadedImage} from '../images';
export async function hash(blob:Blob|string){const raw=typeof blob==='string'?new TextEncoder().encode(blob):await blob.arrayBuffer();return [...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(x=>x.toString(16).padStart(2,'0')).join('')}
export function release(images:LoadedImage[]){images.forEach(im=>URL.revokeObjectURL(im.url))}
export async function upload(client:SupabaseClient,file:File){
 if(file.size>50*1024*1024)throw Error('검수 요청 파일은 50MB까지 올릴 수 있어요.');
 const parsed=submission(await file.text()),digest=await hash(parsed.canonical),loaded:LoadedImage[]=[];
 if(digest!==parsed.proof.contentDigest)throw Error('검수 요청 이후 내용이 바뀌었어요. 다시 검사해 주세요.');
 try{
  for(const im of parsed.images){const decoded=await fromDataUrl(im.data,im.name,im.sha256);loaded.push(decoded);if(decoded.width!==parsed.draft.resolution)throw Error('그림 크기를 확인해 주세요.')}
  const images=loaded.map((im,i)=>({name:im.name,sha256:im.sha256,mime:im.blob.type,path:digest+'/'+i+'.'+(im.blob.type==='image/png'?'png':'webp')}));
  const submitted=await client.rpc('pd3_submit_request',{p_digest:digest,p_draft:parsed.draft,p_images:images,p_canonical:parsed.canonical,p_review_request:parsed.proof});if(submitted.error)throw Error('검수 요청 접수 권한을 확인해 주세요.');
  for(const [i,im] of loaded.entries()){
   const saved=await client.storage.from(BUCKET).upload(images[i].path,im.blob,{contentType:im.blob.type,upsert:false,cacheControl:'0'});
   if(saved.error){const old=await client.storage.from(BUCKET).download(images[i].path);if(old.error||!old.data||await hash(old.data)!==im.sha256)throw Error('이미지를 올리지 못했어요. 같은 파일로 다시 시도해 주세요.')}
  }
  const done=await client.rpc('pd3_finish_upload',{p_digest:digest});if(done.error)throw Error('이미지 접수를 완료하지 못했어요. 같은 파일로 다시 시도해 주세요.');
  return digest;
 }finally{release(loaded)}
}
export async function download(client:SupabaseClient,row:InboxRow){
 const meta=metadata(row),images:LoadedImage[]=[];
 if(await hash(row.canonical)!==row.digest)throw Error('검수 내용 식별값을 확인해 주세요.');
 try{
  for(const im of meta.images){const response=await client.storage.from(BUCKET).download(im.path);if(response.error||!response.data)throw Error('비공개 이미지를 내려받을 권한이 없거나 파일을 찾을 수 없어요.');const image=await decodeImage(response.data,im.name);images.push(image);if(image.sha256!==im.sha256||image.width!==meta.draft.resolution)throw Error('저장된 이미지가 검수 버전과 달라요.')}
  return {...meta,images};
 }catch(error){release(images);throw error}
}
export async function packageFile(row:InboxRow,images:LoadedImage[]){
 const {draft,proof}=metadata(row),files=await Promise.all(images.map(async im=>({name:im.name,sha256:im.sha256,data:await dataUrl(im.blob)})));
 return new Blob([JSON.stringify({format:'pd3-studio-draft',version:1,visibility:'private',draft,images:files,reviewRequest:proof})],{type:'application/json'});
}
