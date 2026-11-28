import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdtemp,readFile,readdir,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {canonicalContent} from '../packages/studio-core/index.mjs';
import {submission} from '../packages/studio-core/inbox.mjs';
import {exportApprovedReview} from './export-approved-review.mjs';
const python=process.env.PD3_PYTHON??'python',worker=fileURLToPath(new URL('../workers/content-review/',import.meta.url)),url='https://abcdefghijklmnopqrst.supabase.co',when='2026-11-28T00:00:00Z';
function fixture(outside=false){
 const env={...process.env};delete env.PD3_SUPABASE_SECRET_KEY;delete env.SUPABASE_SERVICE_ROLE_KEY;
 const code=`import sys,json,base64,io,hashlib;sys.path.insert(0,sys.argv[1]);from test_review import fixture,seal;from PIL import Image;p=fixture()
if sys.argv[2]=='yes':
 im=p['images'][1];image=Image.open(io.BytesIO(base64.b64decode(im['data'].split(',')[1]))).convert('RGB');image.putpixel((250,250),(0,0,0));s=io.BytesIO();image.save(s,format='PNG');raw=s.getvalue();im['data']='data:image/png;base64,'+base64.b64encode(raw).decode();im['sha256']=hashlib.sha256(raw).hexdigest();seal(p)
print(json.dumps(p))`;
 const p=JSON.parse(execFileSync(python,['-c',code,worker,outside?'yes':'no'],{encoding:'utf8',windowsHide:true,env})),digest=p.reviewRequest.contentDigest,files=new Map();
 const images=p.images.map((im,i)=>{const path=digest+'/'+i+'.png';files.set(path,Buffer.from(im.data.split(',')[1],'base64'));return {name:im.name,sha256:im.sha256,mime:'image/png',path}});
 const row={digest,draft:p.draft,canonical:canonicalContent(p.draft,p.images),review_request:p.reviewRequest,images,created_by:'11111111-1111-4111-8111-111111111111',created_at:when,upload_complete:true,pd3_review_validations:[{passed:true,message:'Checked fixture',validator_version:'pd3-pixels-v1',created_at:when}],pd3_review_decisions:[{decision:'approved',actor_id:'22222222-2222-4222-8222-222222222222',note:'Synthetic approval only',created_at:when}]};
 let reads=0,downloads=0;const state={row,files,change:null,downloadFailure:false};
 state.client={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>{reads++;return {data:reads>1&&state.change?state.change:state.row,error:null}}})})}),storage:{from:()=>({download:async path=>{downloads++;return state.downloadFailure?{error:{message:'unavailable'}}:{data:new Blob([files.get(path)]),error:null}}})}};
 state.counts=()=>({reads,downloads});return state;
}
async function folder(fn){const root=await mkdtemp(join(tmpdir(),'pd3-export-test-'));try{await fn(root)}finally{for(const name of await readdir(root))await unlink(join(root,name));await rmdir(root)}}
test('approved export rechecks downloaded pixels, preserves authenticated provenance and grants no catalog authority',async()=>folder(async root=>{
 const f=fixture(),path=join(root,'private.json');assert.deepEqual(await exportApprovedReview(f.client,f.row.digest,path,url,python),{digest:f.row.digest,exported:true,requiresLocalReview:true});
 const saved=JSON.parse(await readFile(path,'utf8'));assert.equal(saved.source.authority,'hosted-review-snapshot');assert.equal(saved.serverReview.decision.actorId,f.row.pd3_review_decisions[0].actor_id);assert.equal(saved.independentCheck.passed,true);
 const p=submission(JSON.stringify(saved.package));assert.equal(p.proof.contentDigest,f.row.digest);assert.equal(p.images.length,2);assert.deepEqual(f.counts(),{reads:2,downloads:2});assert.equal('authority' in saved.package,false);assert.equal('decision' in saved.package,false);
}));
test('pending rejected failed ambiguous or malformed server approvals never download images or create a file',async()=>folder(async root=>{
 const original=fixture();
 for(const change of [{upload_complete:false},{pd3_review_validations:[]},{pd3_review_validations:[{...original.row.pd3_review_validations[0],passed:false}]},{pd3_review_decisions:[{...original.row.pd3_review_decisions[0],decision:'rejected'}]},{pd3_review_decisions:[...original.row.pd3_review_decisions,...original.row.pd3_review_decisions]},{created_by:'not-an-identity'}]){
  const f=fixture();f.row={...f.row,...change};await assert.rejects(()=>exportApprovedReview(f.client,f.row.digest,join(root,'denied.json'),url,python));assert.equal(f.counts().downloads,0);
 }
 assert.deepEqual(await readdir(root),[]);
}));
test('altered bytes outside-region pixels download failures and concurrent decision changes leave no export',async()=>folder(async root=>{
 for(const mode of ['bytes','outside','network','decision']){
  const f=fixture(mode==='outside');if(mode==='bytes')f.files.set(f.row.images[0].path,Buffer.from('altered'));if(mode==='network')f.downloadFailure=true;if(mode==='decision')f.change={...f.row,pd3_review_decisions:[]};
  await assert.rejects(()=>exportApprovedReview(f.client,f.row.digest,join(root,mode+'.json'),url,python));
 }
 assert.deepEqual(await readdir(root),[]);
}));
test('private output is exclusive under concurrent exports and source-checkout paths are denied before network calls',async()=>folder(async root=>{
 const f=fixture(),path=join(root,'only.json');const results=await Promise.allSettled([exportApprovedReview(f.client,f.row.digest,path,url,python),exportApprovedReview(f.client,f.row.digest,path,url,python)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(JSON.parse(await readFile(path,'utf8')).contentDigest,f.row.digest);assert.deepEqual(await readdir(root),['only.json']);
 const denied=fixture();await assert.rejects(()=>exportApprovedReview(denied.client,denied.row.digest,fileURLToPath(new URL('../forbidden-private.json',import.meta.url)),url,python),/outside/);assert.deepEqual(denied.counts(),{reads:0,downloads:0});
}));
