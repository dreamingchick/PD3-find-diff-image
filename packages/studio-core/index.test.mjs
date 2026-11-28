import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseDraft,validateDraft,answersFromDraft,scanPixels,pixelReport,parsePackage,canonicalContent,reviewReadiness} from './index.mjs';
import {createHash} from 'node:crypto';
import {judge} from '../game-engine/index.mjs';
const draft=()=>({id:'studio-fixture',title:'제작 테스트',chapter:'검수',notes:'',difficulty:'easy',limit:120,resolution:256,regions:Array.from({length:5},(_,i)=>({id:i+1,box:[20+i*40,80,36+i*40,96],difficulty:'easy',changeType:'unclassified'}))});
function pixels(){const a=new Uint8ClampedArray(256*256*4);for(let i=0;i<a.length;i+=4){a[i]=a[i+1]=a[i+2]=230;a[i+3]=255}const b=a.slice();for(const r of draft().regions)for(let y=r.box[1];y<r.box[3];y++)for(let x=r.box[0];x<r.box[2];x++){const i=(y*256+x)*4;b[i]=220;b[i+1]=40;b[i+2]=80}return [a,b]}

test('draft structure and metadata reject unsafe IDs and malformed regions',()=>{
 const d=draft();assert.equal(validateDraft(d).errors.length,0);assert.equal(validateDraft({...d,id:'__proto__'}).errors[0].code,'id');
 assert.ok(validateDraft({...d,title:' ',limit:0,regions:[]}).errors.length>=3);assert.throws(()=>parseDraft({...d,regions:[d.regions[0],d.regions[0]]}));assert.equal(validateDraft(null).errors[0].code,'shape');
});
test('bounds, overlaps and shared answer edges cannot pass geometry checks',()=>{
 const d=draft();d.regions[1].box=[36,80,52,96];assert.ok(validateDraft(d).errors.some(e=>e.code==='overlap'));d.regions[0].box=[-1,0,10,10];assert.ok(validateDraft(d).errors.some(e=>e.code==='bounds'));
});
test('change type checks are warnings until manual semantic review',()=>{
 const d=draft();assert.equal(validateDraft(d).warnings[0].code,'unclassified');d.regions.forEach(r=>r.changeType='color');assert.ok(validateDraft(d).warnings.some(e=>e.code==='type-count'));assert.equal(validateDraft(d).errors.length,0);
});
test('pixel rectangles project into independent normalized player hitboxes',()=>{
 const d=draft(),a=answersFromDraft(d);for(const r of a){assert.deepEqual(judge(r.x,r.y,[],a,0),{kind:'correct',id:r.id});assert.deepEqual(judge(r.x,r.y,[],a,1),{kind:'correct',id:r.id})}a[0].hitboxes[0].x=0;assert.notEqual(a[0].hitboxes[1].x,0);assert.equal(d.regions[0].box[0],20);
});
test('chunked pixel inspection equals full scan and records a heatmap',()=>{
 const [a,b]=pixels(),d=draft(),mask=new Uint8ClampedArray(a.length),all=scanPixels(a,b,256,256,d.regions,0,65536,mask),one=scanPixels(a,b,256,256,d.regions,0,32768),two=scanPixels(a,b,256,256,d.regions,32768);
 assert.deepEqual(all.regionChanged,[256,256,256,256,256]);assert.equal(all.totalChanged,1280);assert.equal(pixelReport(all).passed,true);assert.equal(one.totalChanged+two.totalChanged,all.totalChanged);assert.deepEqual(one.regionChanged.map((n,i)=>n+two.regionChanged[i]),all.regionChanged);assert.equal(mask[(80*256+20)*4+3],190);assert.equal(mask[3],0);
});
test('outside, empty, transparent and malformed pixel inputs cannot pass',()=>{
 const [a,b]=pixels(),d=draft();b[(80*256+36)*4]=0;assert.equal(pixelReport(scanPixels(a,b,256,256,d.regions)).passed,false);assert.equal(scanPixels(a,b,256,256,d.regions).outsideChanged,1);
 assert.equal(pixelReport(scanPixels(a,a,256,256,d.regions)).passed,false);a[3]=b[3]=0;assert.equal(scanPixels(a,b,256,256,d.regions).transparent,1);assert.throws(()=>scanPixels(a,b.slice(4),256,256,d.regions));assert.throws(()=>scanPixels(a,b,256,256,d.regions,-1));
});
test('private package import drops claimed QA flags and rejects active/remote payloads',()=>{
 const file={format:'pd3-studio-draft',version:1,visibility:'private',draft:draft(),images:[0,1].map(()=>({name:'fixture.png',data:'data:image/png;base64,AAAA',sha256:'a'.repeat(64)})),qa:{passed:true,semanticReview:'confirmed'}};
 const loaded=parsePackage(JSON.stringify(file));assert.equal('qa' in loaded,false);assert.equal(loaded.draft.regions.length,5);assert.throws(()=>parsePackage(JSON.stringify({...file,visibility:'public'})));assert.throws(()=>parsePackage(JSON.stringify({...file,version:2})));assert.throws(()=>parsePackage(JSON.stringify({...file,images:[{...file.images[0],data:'https://example.com/private.png'},file.images[1]]})));
});
test('parsing clones region arrays and rejects oversized imports',()=>{const d=draft(),p=parseDraft(d);p.regions[0].box[0]=1;assert.equal(d.regions[0].box[0],20);assert.throws(()=>parsePackage('x'.repeat(50*1024*1024+1)));});

test('review revision is canonical across runtimes and binds metadata, regions and images',()=>{
 const d=draft();d.regions.forEach((r,i)=>r.changeType=['add','remove','color','size','move'][i]);
 const images=[{name:'원본.png',sha256:'a'.repeat(64)},{name:'변형.png',sha256:'b'.repeat(64)}],content=canonicalContent(d,images);
 assert.equal(createHash('sha256').update(content).digest('hex'),'774508aacfa61506d50f566597fa49a4b3dcbc588650834767eb4fa314857eca');
 assert.equal(canonicalContent({...d,qa:{passed:true}},images),content);assert.notEqual(canonicalContent({...d,title:d.title+' v2'},images),content);
 assert.notEqual(canonicalContent(d,[images[1],images[0]]),content);assert.throws(()=>canonicalContent(d,[{name:'bad',sha256:'0'},images[1]]));
});
test('review readiness requires valid classified geometry, fresh QA, completed play and manual review',()=>{
 const d=draft(),[a,b]=pixels(),report=scanPixels(a,b,256,256,d.regions);assert.ok(reviewReadiness(d,null,false,false).length>=4);
 d.regions.forEach((r,i)=>r.changeType=['add','remove','color','size','move'][i]);assert.deepEqual(reviewReadiness(d,report,true,true),[]);
 assert.equal(reviewReadiness(d,report,false,true).length,1);assert.equal(reviewReadiness(d,report,true,false).length,1);
 assert.ok(reviewReadiness(d,{...report,outsideChanged:1},true,true).length);d.regions[0].box=[0,0,0,0];assert.ok(reviewReadiness(d,report,true,true).length);
});
