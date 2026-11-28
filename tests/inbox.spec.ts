import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import {createHash} from 'node:crypto';
import {canonicalContent} from '../packages/studio-core/index.mjs';
const host='https://'+'a'.repeat(20)+'.supabase.co',id='00000000-0000-4000-8000-000000000001',email='synthetic-reviewer@example.invalid',password='synthetic-only-password';
async function fixture(page:Page){
 const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d')!;x.fillStyle='#e6e6e6';x.fillRect(0,0,256,256);const a=c.toDataURL('image/png').split(',')[1];x.fillStyle='#dc2850';for(let i=0;i<5;i++)x.fillRect(20+i*40,80,16,16);return [a,c.toDataURL('image/png').split(',')[1]]});
 const draft={id:'inbox-browser-fixture',title:'합성 검수 화면',chapter:'QA',notes:'',difficulty:'easy' as const,limit:120,resolution:256,regions:['add','remove','color','size','move'].map((changeType,i)=>({id:i+1,box:[18+i*40,78,38+i*40,98] as [number,number,number,number],difficulty:'easy' as const,changeType:changeType as 'add'|'remove'|'color'|'size'|'move'}))};
 const bytes=data.map(s=>Buffer.from(s,'base64')),images=bytes.map((raw,i)=>({name:i?'modified.png':'original.png',sha256:createHash('sha256').update(raw).digest('hex'),data:'data:image/png;base64,'+raw.toString('base64')}));
 const canonical=canonicalContent(draft,images),digest=createHash('sha256').update(canonical).digest('hex'),proof={version:1,contentDigest:digest,requestedAt:'2026-11-28T00:00:00Z',testPlayCleared:true,semanticReviewConfirmed:true};
 return {bytes,package:Buffer.from(JSON.stringify({format:'pd3-studio-draft',version:1,visibility:'private',draft,images,reviewRequest:proof})),row:{digest,draft,images:images.map((im,i)=>({name:im.name,sha256:im.sha256,mime:'image/png',path:digest+'/'+i+'.png'})),canonical,review_request:proof,created_by:id,created_at:'2026-11-28T00:00:00Z',upload_complete:true,pd3_review_validations:null as null|{passed:boolean;message:string;validator_version:string},pd3_review_decisions:null as null|{decision:string;note:string;actor_id:string;created_at:string}}};
}
async function server(page:Page,options:{role?:string|null;empty?:boolean;failUpload?:boolean}={}){
 const f=await fixture(page),state={role:options.role===undefined?'reviewer':options.role,active:true,signedIn:false,rows:options.empty?[]:[f.row],files:new Map<string,Buffer>(),failUpload:Boolean(options.failUpload),calls:[] as {path:string;authorization:string}[]};
 if(!options.empty)f.row.images.forEach((im,i)=>state.files.set(im.path,f.bytes[i]));
 const jwt=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url'),token=jwt({alg:'HS256',typ:'JWT'})+'.'+jwt({sub:id,email,aud:'authenticated',role:'authenticated',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})+'.'+Buffer.from('synthetic-signature').toString('base64url');
 const user={id,email,aud:'authenticated',role:'authenticated',email_confirmed_at:'2026-11-28T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{}};
 await page.route('**/admin-config.json',route=>route.fulfill({json:{url:host,publishableKey:'sb_publishable_'+'x'.repeat(24)}}));
 await page.route(host+'/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;state.calls.push({path,authorization:req.headers().authorization??''});
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS'};
  const reply=(value:unknown,status=200)=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(value)});
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(path==='/auth/v1/token'){
   const body=req.postDataJSON();if(body.password!==password&&url.searchParams.get('grant_type')!=='refresh_token')return reply({error:'invalid_grant',error_description:'Invalid credentials'},400);
   state.signedIn=true;return reply({access_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'synthetic-refresh',user});
  }
  if(path==='/auth/v1/user')return state.signedIn?reply(user):reply({message:'No session'},401);
  if(path==='/auth/v1/logout'){state.signedIn=false;return route.fulfill({status:204,headers})}
  if(!state.signedIn||!req.headers().authorization?.includes(token))return reply({message:'Unauthorized'},401);
  if(path==='/rest/v1/pd3_members')return reply(state.role?[{user_id:id,role:state.role,active:state.active}]:[]);
  if(!state.role||!state.active)return reply({message:'Permission denied'},403);
  if(path==='/rest/v1/pd3_review_requests')return reply(state.rows);
  if(path==='/rest/v1/rpc/pd3_submit_request'){
   const body=req.postDataJSON();if(body.p_digest!==f.row.digest)return reply({message:'Invalid digest'},400);
   if(!state.rows.length)state.rows.push({...f.row,upload_complete:false});return reply(f.row.digest);
  }
  if(path==='/rest/v1/rpc/pd3_finish_upload'){
   if(!f.row.images.every(im=>state.files.has(im.path)))return reply({message:'Missing images'},400);
   state.rows[0].upload_complete=true;return reply(f.row.digest);
  }
  if(path==='/rest/v1/rpc/pd3_decide'){
   const body=req.postDataJSON(),row=state.rows[0];if(state.role==='editor'||body.p_decision==='approved'&&!row.pd3_review_validations?.passed)return reply({message:'Permission denied'},403);
   if(row.pd3_review_decisions)return reply({code:'23505',message:'Decision already recorded'},409);
   row.pd3_review_decisions={decision:body.p_decision,note:body.p_note,actor_id:id,created_at:'2026-11-28T00:00:00Z'};return reply(row.digest);
  }
  if(path.startsWith('/storage/v1/object/')){
   const name=path.split('pd3-review-images/')[1];if(!name)return reply({message:'Bad path'},400);
   if(req.method()==='POST'){
    if(state.files.has(name))return reply({statusCode:'409',message:'Already exists'},409);
    if(state.failUpload&&name.endsWith('/1.png')){state.failUpload=false;return reply({message:'Synthetic network failure'},503)}
    const body=req.postDataBuffer()!,contentType=req.headers()['content-type'];
    if(contentType?.startsWith('multipart/form-data')){const form=await new Response(body,{headers:{'content-type':contentType}}).formData();const file=[...form.values()].find(value=>typeof value!=='string') as File;state.files.set(name,Buffer.from(await file.arrayBuffer()))}
    else state.files.set(name,body);
    return reply({Key:'pd3-review-images/'+name});
   }
   const bytes=state.files.get(name);return bytes?route.fulfill({status:200,headers,contentType:'image/png',body:bytes}):reply({message:'Missing image'},404);
  }
  return reply({message:'Unexpected synthetic request'},404);
 });
 return {state,f};
}
async function login(page:Page){await page.goto('/studio/reviews');await expect(page.getByRole('heading',{name:'관리자 로그인',exact:true})).toBeVisible();await page.getByLabel('관리자 이메일',{exact:true}).fill(email);await page.getByLabel('관리자 비밀번호',{exact:true}).fill(password);await page.getByRole('button',{name:'로그인',exact:true}).click()}
test('unconfigured inbox explains setup and leaves the local editor usable',async({page})=>{
 await page.route('**/admin-config.json',route=>route.fulfill({status:404,body:'not configured'}));await page.goto('/studio/reviews');await expect(page.getByRole('heading',{name:'서버 연결 준비 중',exact:true})).toBeVisible();await expect(page.getByLabel('관리자 비밀번호',{exact:true})).toHaveCount(0);await page.getByRole('link',{name:'편집기로 돌아가기',exact:true}).click();await expect(page.getByRole('button',{name:'새 초안',exact:true})).toBeEnabled();await page.getByLabel('제목',{exact:true}).fill('서버 검수 이동 초안');await page.getByRole('link',{name:'서버 검수함',exact:true}).click();await expect(page.getByRole('heading',{name:'서버 연결 준비 중',exact:true})).toBeVisible();await page.getByRole('link',{name:'편집기로 돌아가기',exact:true}).click();await expect(page.getByLabel('제목',{exact:true})).toHaveValue('서버 검수 이동 초안');
});
test('sign-in failures and an authenticated nonmember never reveal the review queue',async({page})=>{
 await server(page,{role:null});await page.goto('/studio/reviews');await page.getByLabel('관리자 이메일',{exact:true}).fill(email);await page.getByLabel('관리자 비밀번호',{exact:true}).fill('wrong-synthetic-password');await page.getByRole('button',{name:'로그인',exact:true}).click();await expect(page.getByText('이메일과 비밀번호를 확인해 주세요.',{exact:true})).toBeVisible();await expect(page.getByLabel('관리자 비밀번호',{exact:true})).toHaveValue('');
 await page.getByLabel('관리자 비밀번호',{exact:true}).fill(password);await page.getByRole('button',{name:'로그인',exact:true}).click();await expect(page.getByText('관리자 권한이 없어요. 계정의 권한 등록을 확인해 주세요.',{exact:true})).toBeVisible();await expect(page.getByLabel('검수 요청 올리기',{exact:true})).toHaveCount(0);await expect(page.getByRole('region',{name:'검수 요청 목록'})).toHaveCount(0);await page.getByRole('button',{name:'로그아웃',exact:true}).click();await expect(page.getByRole('heading',{name:'관리자 로그인',exact:true})).toBeVisible();
});
test('reviewer uses authenticated images and can approve only a checked revision with a note',async({page},testInfo)=>{
 const {state,f}=await server(page);await login(page);const row=page.getByRole('button',{name:/합성 검수 화면/});await expect(row).toBeEnabled();await row.click();await expect(page.locator('.studio-picture')).toHaveCount(2);await page.getByLabel('검수 메모',{exact:true}).fill('Synthetic reviewer confirmation');await expect(page.getByRole('button',{name:'이 버전 승인',exact:true})).toBeDisabled();
 state.rows[0].pd3_review_validations={passed:true,message:'Synthetic verified pixels',validator_version:'synthetic-v1'};await page.getByRole('button',{name:'새로고침',exact:true}).click();await expect(row).toBeEnabled();await row.click();await expect(page.locator('.studio-picture')).toHaveCount(2);await page.getByLabel('검수 메모',{exact:true}).fill('Synthetic reviewer confirmation');await page.getByRole('button',{name:'이 버전 승인',exact:true}).click();await expect(page.getByText('승인을 기록했어요. 게임 적용은 별도 배포 단계에서 진행돼요.',{exact:true})).toBeVisible();await row.click();await expect(page.getByRole('heading',{name:'승인 결과',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'이 버전 승인',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:testInfo.outputPath('inbox.png'),fullPage:true});
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'검수 파일 내려받기',exact:true}).click();const stream=(await (await pending).createReadStream())!,parts:Buffer[]=[];for await(const p of stream)parts.push(Buffer.from(p));const file=JSON.parse(Buffer.concat(parts).toString());expect(file.reviewRequest.contentDigest).toBe(f.row.digest);expect(file.visibility).toBe('private');
 expect(state.calls.filter(c=>c.path.startsWith('/storage/')).every(c=>c.authorization.startsWith('Bearer '))).toBe(true);expect(state.calls.some(c=>c.path.includes('/public/')||c.path.includes('/sign/'))).toBe(false);
});
test('editor retries partial uploads without replacement and loses private previews after revocation',async({page})=>{
 const {state,f}=await server(page,{role:'editor',empty:true,failUpload:true});await login(page);const input=page.getByLabel('검수 요청 올리기',{exact:true});await expect(input).toBeEnabled();const file={name:'synthetic.review.json',mimeType:'application/json',buffer:f.package};await input.setInputFiles(file);await expect(page.getByText('이미지를 올리지 못했어요. 같은 파일로 다시 시도해 주세요.',{exact:true})).toBeVisible();expect(state.files.size).toBe(1);
 await input.setInputFiles(file);await expect(page.getByText('접수했어요. 서버 이미지 검사 후 승인할 수 있어요.',{exact:true})).toBeVisible();expect(state.files.size).toBe(2);await page.getByRole('button',{name:/합성 검수 화면/}).click();await expect(page.locator('.studio-picture')).toHaveCount(2);await expect(page.getByRole('button',{name:'이 버전 승인',exact:true})).toHaveCount(0);
 const url=await page.locator('.studio-picture image').first().getAttribute('href');state.active=false;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByText('관리자 권한이 없어요. 계정의 권한 등록을 확인해 주세요.',{exact:true})).toBeVisible();await expect(page.locator('.studio-picture')).toHaveCount(0);expect(await page.evaluate(async url=>{try{return (await fetch(url!)).ok}catch{return false}},url)).toBe(false);
});
