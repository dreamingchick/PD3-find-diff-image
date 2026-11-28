import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adminConfig,submission,reviewProof,metadata,status} from './inbox.mjs';
import {canonicalContent} from './index.mjs';
import {createHash} from 'node:crypto';
const draft={id:'inbox-fixture',title:'Synthetic inbox',chapter:'QA',notes:'',difficulty:'easy',limit:120,resolution:256,regions:['add','remove','color','size','move'].map((changeType,i)=>({id:i+1,box:[20+i*40,80,36+i*40,96],difficulty:'easy',changeType}))};
const images=[{name:'a.png',sha256:'a'.repeat(64),data:'data:image/png;base64,AAAA'},{name:'b.png',sha256:'b'.repeat(64),data:'data:image/png;base64,AAAA'}];
const canonical=canonicalContent(draft,images),digest=createHash('sha256').update(canonical).digest('hex'),proof={version:1,contentDigest:digest,testPlayCleared:true,semanticReviewConfirmed:true,requestedAt:'2026-11-28T00:00:00Z'};
test('browser connection accepts only a standard HTTPS project and publishable key',()=>{
 const good={url:'https://'+'a'.repeat(20)+'.supabase.co',publishableKey:'sb_publishable_'+'x'.repeat(24)};assert.deepEqual(adminConfig(good),good);
 for(const bad of [{...good,url:'http://localhost'},{...good,url:good.url+'/evil'},{...good,publishableKey:'sb_secret_'+'x'.repeat(24)},null])assert.throws(()=>adminConfig(bad));
});
test('inbox submission requires classified content-bound review claims and drops local QA authority',()=>{
 const file={format:'pd3-studio-draft',version:1,visibility:'private',draft,images,reviewRequest:proof,qa:{passed:true}};
 const loaded=submission(JSON.stringify(file));assert.equal(loaded.canonical,canonical);assert.equal('qa' in loaded,false);
 assert.throws(()=>submission(JSON.stringify({...file,reviewRequest:undefined})));assert.throws(()=>reviewProof({...proof,semanticReviewConfirmed:false},digest));assert.throws(()=>reviewProof({...proof,requestedAt:'bad'},digest));
 const unclassified={...draft,regions:draft.regions.map((r,i)=>i?r:{...r,changeType:'unclassified'})};assert.throws(()=>submission(JSON.stringify({...file,draft:unclassified})));
});
test('stored image paths and canonical versions cannot redirect private downloads; approval status requires a decision',()=>{
 const row={digest,draft,images:images.map((im,i)=>({name:im.name,sha256:im.sha256,mime:'image/png',path:digest+'/'+i+'.png'})),canonical,review_request:proof,upload_complete:true,pd3_review_decisions:null,pd3_review_validations:null};
 assert.equal(metadata(row).proof.contentDigest,digest);assert.equal(status(row),'서버 검사 대기');assert.equal(status({...row,pd3_review_validations:{passed:true}}),'승인 대기');assert.equal(status({...row,pd3_review_decisions:{decision:'approved'}}),'승인 완료');
 assert.throws(()=>metadata({...row,canonical:'{}'}));assert.throws(()=>metadata({...row,images:row.images.map((im,i)=>i?im:{...im,path:'https://example.com/private.png'})}));
});
