// Trusted server operator: export a revalidated snapshot, never grant local approval.
import {createClient} from '@supabase/supabase-js';
import {metadata,BUCKET} from '../packages/studio-core/inbox.mjs';
import {validateRequest} from './validate-inbox.mjs';
import {mkdtemp,writeFile,link,unlink,rmdir,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute,dirname,basename,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const source=fileURLToPath(new URL('../',import.meta.url));
const fields='digest,draft,images,canonical,review_request,created_by,created_at,upload_complete,pd3_review_validations(passed,message,validator_version,created_at),pd3_review_decisions(decision,note,actor_id,created_at)';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const timestamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const single=v=>Array.isArray(v)?v.length===1?v[0]:null:v;
export function approvedSnapshot(row,digest){
 const validation=single(row?.pd3_review_validations),decision=single(row?.pd3_review_decisions);
 if(!/^[a-f0-9]{64}$/.test(digest??'')||row?.digest!==digest||row.upload_complete!==true||!uuid.test(row.created_by??'')||!timestamp(row.created_at)||validation?.passed!==true||validation.validator_version!=='pd3-pixels-v1'||typeof validation.message!=='string'||validation.message.length>500||!timestamp(validation.created_at)||decision?.decision!=='approved'||!uuid.test(decision.actor_id??'')||typeof decision.note!=='string'||!decision.note.trim()||decision.note.length>2000||!timestamp(decision.created_at))throw Error('A completed, independently checked, approved revision is required');
 metadata(row);
 return {digest,canonical:row.canonical,images:row.images,reviewRequest:row.review_request,createdBy:row.created_by,submittedAt:row.created_at,validation:{passed:true,validatorVersion:validation.validator_version,message:validation.message,checkedAt:validation.created_at},decision:{decision:'approved',actorId:decision.actor_id,note:decision.note,decidedAt:decision.created_at}};
}
async function privateTarget(output){
 const target=resolve(output),parent=await realpath(dirname(target)),root=await realpath(source),delta=relative(root,parent);
 if(delta===''||(!delta.startsWith('..'+(process.platform==='win32'?'\\':'/'))&&delta!=='..'&&!isAbsolute(delta)))throw Error('Private exports must be outside the player source checkout');
 return {parent,target:join(parent,basename(target))};
}
export async function exportApprovedReview(client,digest,output,projectURL,python=process.env.PD3_PYTHON??'python'){
 if(!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(projectURL??''))throw Error('Dedicated project URL required');
 const destination=await privateTarget(output);
 const read=async()=>{const result=await client.from('pd3_review_requests').select(fields).eq('digest',digest).maybeSingle();if(result.error||!result.data)throw Error('Approved review is unavailable');return result.data};
 const row=await read(),snapshot=approvedSnapshot(row,digest),value=metadata(row),bytes=new Map();
 for(const image of value.images){const result=await client.storage.from(BUCKET).download(image.path);if(result.error||!result.data)throw Error('Private review image download failed');bytes.set(image.path,Buffer.from(await result.data.arrayBuffer()))}
 const receipt=await validateRequest(row,path=>bytes.get(path),python);
 if(!receipt.passed)throw Error('Independent export image validation failed');
 const latest=approvedSnapshot(await read(),digest);
 if(JSON.stringify(latest)!==JSON.stringify(snapshot))throw Error('Review changed during export');
 const packageValue={format:'pd3-studio-draft',version:1,visibility:'private',draft:value.draft,images:value.images.map(image=>({name:image.name,sha256:image.sha256,data:`data:${image.mime};base64,${bytes.get(image.path).toString('base64')}`})),reviewRequest:value.proof};
 const contents=JSON.stringify({format:'pd3-hosted-review-export',version:1,visibility:'private',source:{url:projectURL,authority:'hosted-review-snapshot'},contentDigest:digest,exportedAt:new Date().toISOString(),serverReview:snapshot,independentCheck:receipt,package:packageValue});
 if(Buffer.byteLength(contents)>51*1024*1024)throw Error('Private export exceeds size limit');
 const temporary=await mkdtemp(join(destination.parent,'.pd3-export-')),file=join(temporary,'export.json');
 try{await writeFile(file,contents,{mode:0o600,flag:'wx'});await link(file,destination.target)}
 finally{await unlink(file).catch(()=>{});await rmdir(temporary)}
 return {digest,exported:true,requiresLocalReview:true};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [digest,output,...extra]=process.argv.slice(2),url=process.env.PD3_SUPABASE_URL,key=process.env.PD3_SUPABASE_SECRET_KEY;
  if(extra.length||!output||!/^[a-f0-9]{64}$/.test(digest??'')||!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url??'')||!/^sb_secret_[A-Za-z0-9_-]{10,200}$/.test(key??''))throw Error('Provide one approved digest, a private output file and trusted server environment');
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  console.log(JSON.stringify(await exportApprovedReview(client,digest,output,url)));
 }catch{console.error('Private review export failed; verify approval, images, server connection and unused private output path');process.exitCode=1}
}
