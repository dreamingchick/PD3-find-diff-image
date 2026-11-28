// Trusted server operator only. Secret keys never enter the browser build.
import {createClient} from '@supabase/supabase-js';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {metadata,BUCKET} from '../packages/studio-core/inbox.mjs';
const run=promisify(execFile),validator=fileURLToPath(new URL('../workers/content-review/validate_remote.py',import.meta.url));
const failed=()=>({passed:false,message:'이미지 또는 검수 요청의 검증 값이 일치하지 않습니다.'});
export async function validateRequest(row,loadImage,python=process.env.PD3_PYTHON??'python'){
 let value;
 try{value=metadata(row);if(createHash('sha256').update(row.canonical).digest('hex')!==row.digest)return failed()}catch{return failed()}
 const images=[];
 for(const im of value.images){
  // Network failures propagate without writing a terminal failed receipt.
  const raw=Buffer.from(await loadImage(im.path));
  if(!raw.length||raw.length>16*1024*1024||createHash('sha256').update(raw).digest('hex')!==im.sha256)return failed();
  images.push({name:im.name,sha256:im.sha256,data:`data:${im.mime};base64,${raw.toString('base64')}`});
 }
 const contents=JSON.stringify({format:'pd3-studio-draft',version:1,visibility:'private',draft:value.draft,images,reviewRequest:value.proof});
 if(Buffer.byteLength(contents)>50*1024*1024)return failed();
 const directory=await mkdtemp(join(tmpdir(),'pd3-review-')),file=join(directory,'request.json');
 try{
  await writeFile(file,contents,{mode:0o600});
  const childEnv={...process.env};delete childEnv.PD3_SUPABASE_SECRET_KEY;delete childEnv.SUPABASE_SERVICE_ROLE_KEY;
  const result=await run(python,[validator,file],{encoding:'utf8',timeout:120000,maxBuffer:8192,windowsHide:true,env:childEnv});
  const receipt=JSON.parse(result.stdout);if(typeof receipt.passed!=='boolean'||typeof receipt.message!=='string'||receipt.message.length>500)throw Error('Validator returned an invalid receipt');return receipt;
 }finally{await unlink(file).catch(()=>{});await rmdir(directory)}
}
export async function validateInbox(client,limit=10){
 const pending=await client.rpc('pd3_pending_validation',{p_limit:limit});if(pending.error)throw Error('Cannot read the private validation queue');
 const summary={validated:0,alreadyValidated:0};
 for(const row of pending.data??[]){
  const receipt=await validateRequest(row,async path=>{const r=await client.storage.from(BUCKET).download(path);if(r.error||!r.data)throw Error('Private image download failed; leave request pending');return r.data.arrayBuffer()});
  const stored=await client.from('pd3_review_validations').insert({digest:row.digest,...receipt,validator_version:'pd3-pixels-v1'});
  if(stored.error?.code==='23505'){summary.alreadyValidated++;continue}if(stored.error)throw Error('Cannot record the private validation receipt');
  summary.validated++;process.stdout.write(`${row.digest.slice(0,12)} ${receipt.passed?'PASS':'REJECT'}\n`);
 }
 return summary;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const url=process.env.PD3_SUPABASE_URL,key=process.env.PD3_SUPABASE_SECRET_KEY;
  if(!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url??'')||!/^sb_secret_[A-Za-z0-9_-]{10,200}$/.test(key??''))throw Error('Set the dedicated PD3 server URL and secret key in the worker environment');
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  process.stdout.write(JSON.stringify(await validateInbox(client))+'\n');
 }catch(error){process.stderr.write((error instanceof Error?error.message:'Private validation failed')+'\n');process.exitCode=1}
}
