import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {canonicalContent} from '../packages/studio-core/index.mjs';
import {validateRequest,validateInbox} from './validate-inbox.mjs';
const run=promisify(execFile),python=process.env.PD3_PYTHON??'python',worker=fileURLToPath(new URL('../workers/content-review/',import.meta.url));
async function fixture(outside=false){
 const code=`import sys,json,base64,io,hashlib;sys.path.insert(0,sys.argv[1]);from test_review import fixture,seal;from PIL import Image;p=fixture()
if sys.argv[2]=='yes':
 im=p['images'][1];image=Image.open(io.BytesIO(base64.b64decode(im['data'].split(',')[1]))).convert('RGB');image.putpixel((250,250),(0,0,0));s=io.BytesIO();image.save(s,format='PNG');raw=s.getvalue();im['data']='data:image/png;base64,'+base64.b64encode(raw).decode();im['sha256']=hashlib.sha256(raw).hexdigest();seal(p)
print(json.dumps(p))`;
 const result=await run(python,['-c',code,worker,outside?'yes':'no'],{encoding:'utf8',windowsHide:true});
 const p=JSON.parse(result.stdout),digest=p.reviewRequest.contentDigest,files=new Map();
 const images=p.images.map((im,i)=>{const path=digest+'/'+i+'.png';files.set(path,Buffer.from(im.data.split(',')[1],'base64'));return {name:im.name,sha256:im.sha256,mime:'image/png',path}});
 return {row:{digest,draft:p.draft,canonical:canonicalContent(p.draft,p.images),images,review_request:p.reviewRequest},files};
}
test('server worker reconstructs and independently checks bytes despite forged browser QA assertions',async()=>{
 const good=await fixture(),bad=await fixture(true);assert.equal((await validateRequest(good.row,path=>good.files.get(path),python)).passed,true);
 assert.equal((await validateRequest(bad.row,path=>bad.files.get(path),python)).passed,false);
 assert.equal((await validateRequest(good.row,()=>Buffer.from('modified bytes'),python)).passed,false);
 await assert.rejects(()=>validateRequest(good.row,()=>{throw Error('Synthetic network failure')},python),/network failure/);
});
test('inbox worker records an immutable receipt and tolerates another worker winning the same revision',async()=>{
 const f=await fixture(),receipts=[];
 const client={rpc:async()=>({data:[f.row],error:null}),storage:{from:()=>({download:async path=>({data:new Blob([f.files.get(path)]),error:null})})},from:()=>({insert:async receipt=>{receipts.push(receipt);return {error:null}}})};
 const previous=process.env.PD3_PYTHON;process.env.PD3_PYTHON=python;
 try{
  assert.deepEqual(await validateInbox(client),{validated:1,alreadyValidated:0});assert.equal(receipts[0].passed,true);assert.equal(receipts[0].digest,f.row.digest);assert.equal('decision' in receipts[0],false);
  client.from=()=>({insert:async()=>({error:{code:'23505'}})});assert.deepEqual(await validateInbox(client),{validated:0,alreadyValidated:1});
 }finally{if(previous===undefined)delete process.env.PD3_PYTHON;else process.env.PD3_PYTHON=previous}
});
