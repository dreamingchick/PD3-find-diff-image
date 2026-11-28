import {test,before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createHash} from 'node:crypto';
import {canonicalContent} from '../studio-core/index.mjs';
let db;
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002',R='00000000-0000-4000-8000-000000000003',X='00000000-0000-4000-8000-000000000004';
before(async()=>{
 db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
 alter table storage.objects enable row level security;
 grant usage on schema public,auth,storage to anon,authenticated,service_role;
 grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;`);
 const folder=new URL('../../supabase/migrations/',import.meta.url);
 for(const file of (await readdir(folder)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,folder),'utf8'));
});
beforeEach(async()=>{
 await db.exec(`reset role;truncate public.pd3_review_decisions,public.pd3_review_validations,storage.objects,public.pd3_review_requests,public.pd3_members,auth.users cascade;
 insert into auth.users(id) values('${A}'),('${B}'),('${R}'),('${X}');
 insert into public.pd3_members(user_id,role) values('${A}','editor'),('${B}','editor'),('${R}','reviewer');`);
});
after(async()=>{await db?.close()});
async function as(id,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);await db.exec('set role '+role)}
function fixture(title='Policy fixture'){
 const draft={id:'policy-fixture',title,chapter:'Synthetic',notes:'',difficulty:'easy',limit:120,resolution:256,regions:['add','remove','color','size','move'].map((changeType,i)=>({id:i+1,box:[20+i*40,80,36+i*40,96],difficulty:'easy',changeType}))};
 const images=[{name:'original.png',sha256:'a'.repeat(64)},{name:'modified.png',sha256:'b'.repeat(64)}],canonical=canonicalContent(draft,images),digest=createHash('sha256').update(canonical).digest('hex');
 return {draft,canonical,digest,images:images.map((im,i)=>({...im,mime:'image/png',path:digest+'/'+i+'.png'})),request:{version:1,contentDigest:digest,testPlayCleared:true,semanticReviewConfirmed:true,requestedAt:'2026-11-28T00:00:00Z'}};
}
async function submit(f){return db.query('select public.pd3_submit_request($1,$2::jsonb,$3::jsonb,$4,$5::jsonb)',[f.digest,JSON.stringify(f.draft),JSON.stringify(f.images),f.canonical,JSON.stringify(f.request)])}
async function upload(f){for(const im of f.images)await db.query("insert into storage.objects(bucket_id,name) values('pd3-review-images',$1)",[im.path]);await db.query('select public.pd3_finish_upload($1)',[f.digest])}
async function decide(f,decision='approved',note='Synthetic policy review'){return db.query('select public.pd3_decide($1,$2,$3)',[f.digest,decision,note])}
async function validate(f,passed=true){await as(null,'service_role');await db.query("insert into public.pd3_review_validations(digest,passed,validator_version,message) values($1,$2,'synthetic-v1','Synthetic receipt only')",[f.digest,passed])}

test('anonymous and unregistered identities cannot access requests, functions or private images',async()=>{
 const f=fixture();await as(A);await submit(f);await upload(f);
 await as(null,'anon');await assert.rejects(()=>db.query('select * from public.pd3_review_requests'));await assert.rejects(()=>submit(f));assert.equal((await db.query('select * from storage.objects')).rows.length,0);
 await as(X);assert.equal((await db.query('select * from public.pd3_review_requests')).rows.length,0);assert.equal((await db.query('select * from storage.objects')).rows.length,0);await assert.rejects(()=>submit(f));
 await db.exec('reset role');assert.equal((await db.query("select public from storage.buckets where id='pd3-review-images'")).rows[0].public,false);
});
test('editors see only their requests and cannot self-grant roles through claims or table writes',async()=>{
 const a=fixture('A'),b=fixture('B');await as(A);await submit(a);await as(B);await submit(b);
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:B,user_metadata:{role:'owner'},app_metadata:{role:'owner'}})]);
 assert.deepEqual((await db.query('select digest from public.pd3_review_requests')).rows.map(r=>r.digest),[b.digest]);
 await assert.rejects(()=>db.query("update public.pd3_members set role='owner' where user_id=$1",[B]));
 await as(R);assert.equal((await db.query('select digest from public.pd3_review_requests')).rows.length,2);
});
test('submission binds exact content, paths and identity and cannot mutate metadata or fake completed uploads',async()=>{
 const f=fixture();await as(A);await assert.rejects(()=>submit({...f,digest:'0'.repeat(64)}));await assert.rejects(()=>submit({...f,images:f.images.map((x,i)=>i?x:{...x,path:'../escape.png'})}));
 await submit(f);await assert.rejects(()=>db.query('select public.pd3_finish_upload($1)',[f.digest]));await assert.rejects(()=>db.query("update public.pd3_review_requests set draft='{}' where digest=$1",[f.digest]));
 await assert.rejects(()=>db.query('update public.pd3_review_requests set created_by=$1 where digest=$2',[B,f.digest]));
 await upload(f);await db.query('select public.pd3_finish_upload($1)',[f.digest]);assert.equal((await db.query('select upload_complete from public.pd3_review_requests')).rows[0].upload_complete,true);
});
test('storage accepts only the creator’s two immutable image paths before finalization',async()=>{
 const f=fixture();await as(A);await submit(f);
 await assert.rejects(()=>db.query("insert into storage.objects(bucket_id,name) values('pd3-review-images',$1)",[f.digest+'/extra.png']));
 await as(B);await assert.rejects(()=>db.query("insert into storage.objects(bucket_id,name) values('pd3-review-images',$1)",[f.images[0].path]));
 await as(A);await upload(f);assert.equal((await db.query('update storage.objects set name=name returning id')).rows.length,0);assert.equal((await db.query('delete from storage.objects returning id')).rows.length,0);
 assert.equal((await db.query('select * from storage.objects')).rows.length,2);
});
test('approval requires an active reviewer and independent worker proof; decision identity and immutability are enforced',async()=>{
 const f=fixture();await as(A);await submit(f);await upload(f);await assert.rejects(()=>decide(f));await as(R);await assert.rejects(()=>decide(f));
 await validate(f);await as(R);await decide(f);const row=(await db.query('select * from public.pd3_review_decisions')).rows[0];assert.equal(row.actor_id,R);assert.equal(row.decision,'approved');
 await assert.rejects(()=>decide(f,'rejected'));await assert.rejects(()=>db.query("update public.pd3_review_decisions set decision='rejected'"));await assert.rejects(()=>db.query('delete from public.pd3_review_decisions'));
});
test('browser identities cannot forge validation receipts and failed validation cannot authorize approval',async()=>{
 const f=fixture();await as(A);await submit(f);await upload(f);await as(R);await assert.rejects(()=>db.query("insert into public.pd3_review_validations(digest,passed,validator_version,message) values($1,true,'forged','forged')",[f.digest]));
 await validate(f,false);await as(R);await assert.rejects(()=>decide(f));await decide(f,'rejected');
 await as(null,'service_role');await assert.rejects(()=>db.query("insert into public.pd3_members(user_id,role) values($1,'owner')",[X]));await assert.rejects(()=>decide(f));
});
test('duplicate submissions are idempotent for the creator and unavailable to another editor',async()=>{
 const f=fixture();await as(A);await submit(f);await submit(f);assert.equal((await db.query('select digest from public.pd3_review_requests')).rows.length,1);
 await as(B);await assert.rejects(()=>submit(f));assert.equal((await db.query('select digest from public.pd3_review_requests')).rows.length,0);
});
test('revocation immediately blocks data, images and decisions despite an existing identity claim',async()=>{
 const f=fixture();await as(A);await submit(f);await upload(f);await validate(f);await as(R);assert.equal((await db.query('select digest from public.pd3_review_requests')).rows.length,1);
 await db.exec('reset role');await db.query('update public.pd3_members set active=false where user_id=$1',[R]);await as(R);
 assert.equal((await db.query('select digest from public.pd3_review_requests')).rows.length,0);assert.equal((await db.query('select * from storage.objects')).rows.length,0);await assert.rejects(()=>decide(f));
});
test('only the worker can read the unfinished validation queue, excluding incomplete and already checked requests',async()=>{
 const a=fixture('Complete'),b=fixture('Incomplete');await as(A);await submit(a);await upload(a);await submit(b);
 await assert.rejects(()=>db.query('select * from public.pd3_pending_validation(10)'));await as(R);await assert.rejects(()=>db.query('select * from public.pd3_pending_validation(10)'));
 await as(null,'service_role');assert.deepEqual((await db.query('select digest from public.pd3_pending_validation(10)')).rows.map(r=>r.digest),[a.digest]);await validate(a);assert.equal((await db.query('select digest from public.pd3_pending_validation(10)')).rows.length,0);
});
