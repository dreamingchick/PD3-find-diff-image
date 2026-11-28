"use client";
import {useEffect,useRef,useState} from 'react';
import {createClient} from '@supabase/supabase-js';
import type {SupabaseClient} from '@supabase/supabase-js';
import {adminConfig,status,one} from '../../../../../packages/studio-core/inbox.mjs';
import type {InboxRow} from '../../../../../packages/studio-core/inbox.mjs';
import RegionSurface from '../RegionSurface';
import {upload,download,packageFile,release} from './files';

type Member={user_id:string;role:'editor'|'reviewer'|'owner';active:boolean};
type Preview=Awaited<ReturnType<typeof download>>;
const roleNames={editor:'제작자',reviewer:'검수자',owner:'관리자'};
const title=(row:InboxRow)=>row.draft&&typeof row.draft==='object'&&'title' in row.draft&&typeof row.draft.title==='string'?row.draft.title:'제목 확인 필요';
const errorText=(error:unknown)=>error instanceof Error?error.message:'요청을 완료하지 못했어요.';
export default function Inbox(){
 const [client,setClient]=useState<SupabaseClient|null>(null),[configState,setConfigState]=useState<'loading'|'ready'|'missing'|'invalid'>('loading');
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[userEmail,setUserEmail]=useState<string|null>(null),[member,setMember]=useState<Member|null>(null);
 const [rows,setRows]=useState<InboxRow[]>([]),[selected,setSelected]=useState<InboxRow|null>(null),[preview,setPreview]=useState<Preview|null>(null),[note,setNote]=useState('');
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const alive=useRef(true),generation=useRef(0),previewRef=useRef<Preview|null>(null),busyRef=useRef(false);
 busyRef.current=busy;
 function clearPreview(){if(previewRef.current)release(previewRef.current.images);previewRef.current=null;setPreview(null)}
 function clearData(){generation.current++;clearPreview();setRows([]);setSelected(null);setMember(null);setNote('');setBusy(false)}
 async function refresh(api:SupabaseClient){
  const token=++generation.current;setBusy(true);
  try{
   const auth=await api.auth.getUser();if(!alive.current||token!==generation.current)return;
   if(auth.error||!auth.data.user){clearData();setUserEmail(null);return}
   setUserEmail(auth.data.user.email??'관리자 계정');
   const membership=await api.from('pd3_members').select('user_id,role,active').eq('user_id',auth.data.user.id).maybeSingle();
   if(!alive.current||token!==generation.current)return;
   const value=membership.data as Member|null;
   if(membership.error||!value?.active||!['owner','reviewer','editor'].includes(value.role)){clearData();setMessage('관리자 권한이 없어요. 계정의 권한 등록을 확인해 주세요.');return}
   setMember(value);
   const response=await api.from('pd3_review_requests').select('digest,draft,images,canonical,review_request,created_by,created_at,upload_complete,pd3_review_validations(passed,message,validator_version),pd3_review_decisions(decision,note,actor_id,created_at)').order('created_at',{ascending:false}).limit(50);
   if(!alive.current||token!==generation.current)return;
   if(response.error)throw Error('검수함을 불러오지 못했어요. 연결과 계정 권한을 확인해 주세요.');
   const next=response.data as unknown as InboxRow[];setRows(next);clearPreview();setSelected(null);setNote('');
  }catch(error){if(alive.current&&token===generation.current){clearData();setMessage(errorText(error))}}
  finally{if(alive.current&&token===generation.current)setBusy(false)}
 }
 useEffect(()=>{
  alive.current=true;let active=true,api:SupabaseClient|null=null;
  (async()=>{try{
   const response=await fetch('/admin-config.json',{cache:'no-store'});if(!active)return;
   if(response.status===404){setConfigState('missing');return}if(!response.ok)throw Error('연결 설정을 확인해 주세요.');
   const config=adminConfig(await response.json());if(!active)return;
   api=createClient(config.url,config.publishableKey,{auth:{storageKey:'pd3-studio-auth-'+new URL(config.url).hostname.split('.')[0],persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
   setClient(api);setConfigState('ready');
  }catch{if(active)setConfigState('invalid')}})();
  return()=>{active=false;alive.current=false;generation.current++;if(previewRef.current)release(previewRef.current.images);api?.auth.stopAutoRefresh()};
 },[]);
 useEffect(()=>{
  if(!client)return;void refresh(client);
  const {data}=client.auth.onAuthStateChange((event)=>{
   if(event==='SIGNED_OUT'){clearData();setUserEmail(null);setMessage('로그아웃했어요.')}
   else if(event==='TOKEN_REFRESHED'||event==='USER_UPDATED'||event==='SIGNED_IN')setTimeout(()=>{if(alive.current&&!busyRef.current)void refresh(client)},0);
  });
  const focus=()=>{if(!busyRef.current)void refresh(client)};window.addEventListener('focus',focus);
  return()=>{data.subscription.unsubscribe();window.removeEventListener('focus',focus)};
 },[client]);
 async function signIn(){
  if(!client||busy)return;setBusy(true);setMessage('');const token=generation.current;
  try{const result=await client.auth.signInWithPassword({email:email.trim(),password});if(result.error)throw Error('이메일과 비밀번호를 확인해 주세요.');if(alive.current&&token===generation.current)await refresh(client)}
  catch(error){if(alive.current&&token===generation.current)setMessage(errorText(error))}finally{setPassword('');if(alive.current&&token===generation.current)setBusy(false)}
 }
 async function signOut(){if(!client)return;clearData();setUserEmail(null);setPassword('');await client.auth.signOut({scope:'local'});setMessage('로그아웃했어요.')}
 async function send(file:File){
  if(!client||!member||busy)return;const token=generation.current;setBusy(true);setMessage('비공개 검수 요청을 올리고 있어요.');
  try{await upload(client,file);if(alive.current&&token===generation.current){await refresh(client);setMessage('접수했어요. 서버 이미지 검사 후 승인할 수 있어요.')}}
  catch(error){if(alive.current&&token===generation.current)setMessage(errorText(error))}finally{if(alive.current&&token===generation.current)setBusy(false)}
 }
 async function open(row:InboxRow){
  if(!client||busy)return;clearPreview();setSelected(row);setNote('');setBusy(true);setMessage('');const token=generation.current;
  try{const value=await download(client,row);if(!alive.current||token!==generation.current){release(value.images);return}previewRef.current=value;setPreview(value)}
  catch(error){if(alive.current&&token===generation.current)setMessage(errorText(error))}finally{if(alive.current&&token===generation.current)setBusy(false)}
 }
 async function saveFile(){
  if(!selected||!preview||busy)return;const token=generation.current;setBusy(true);
  try{const file=await packageFile(selected,preview.images);if(!alive.current||token!==generation.current)return;const url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=preview.draft.id+'.review.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage('비공개 검수 파일을 내려받았어요. 편집기에서 열면 다시 검사해야 해요.')}
  catch(error){if(alive.current&&token===generation.current)setMessage(errorText(error))}finally{if(alive.current&&token===generation.current)setBusy(false)}
 }
 async function decide(decision:'approved'|'rejected'){
  if(!client||!selected||!member||busy||!note.trim()||!['owner','reviewer'].includes(member.role))return;
  const token=generation.current;setBusy(true);
  try{const response=await client.rpc('pd3_decide',{p_digest:selected.digest,p_decision:decision,p_note:note.trim()});if(response.error)throw Error('결정 권한이나 서버 검사 상태가 바뀌었어요. 새로고침 후 확인해 주세요.');if(alive.current&&token===generation.current){await refresh(client);setMessage(decision==='approved'?'승인을 기록했어요. 게임 적용은 별도 배포 단계에서 진행돼요.':'반려를 기록했어요. 수정한 초안은 새 버전으로 접수해 주세요.')}}
  catch(error){if(alive.current&&token===generation.current)setMessage(errorText(error))}finally{if(alive.current&&token===generation.current)setBusy(false)}
 }
 const check=selected?one(selected.pd3_review_validations):null,decision=selected?one(selected.pd3_review_decisions):null,reviewer=member&&['owner','reviewer'].includes(member.role);
 return <main className="inbox-shell">
  <header className="inbox-header"><div><span className="eyebrow">PRIVATE REVIEW WORKSPACE</span><h1>비공개 검수함</h1></div><a href="/studio">편집기로</a>{userEmail&&<button onClick={signOut}>로그아웃</button>}</header>
  <p className="inbox-intro">그림을 전달하고, 확인한 버전에 검수 결과를 남기세요. 승인된 콘텐츠의 게임 적용은 별도 배포 단계에서 진행됩니다.</p>
  {configState==='loading'&&<p role="status">관리자 연결을 확인하고 있어요.</p>}
  {(configState==='missing'||configState==='invalid')&&<section className="inbox-setup"><h2>서버 연결 준비 중</h2><p>{configState==='missing'?'관리자 계정과 비공개 검수함 연결이 아직 설정되지 않았어요.':'관리자 연결 설정을 확인해야 해요.'}</p><p>기존 편집기의 초안 저장·검사·파일 내보내기는 계속 사용할 수 있어요.</p><a href="/studio">편집기로 돌아가기</a></section>}
  {configState==='ready'&&!userEmail&&<form className="inbox-login" onSubmit={event=>{event.preventDefault();void signIn()}}><h2>관리자 로그인</h2><p>등록된 관리자 계정으로 로그인해 주세요.</p><label>이메일<input aria-label="관리자 이메일" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required disabled={busy}/></label><label>비밀번호<input aria-label="관리자 비밀번호" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required disabled={busy}/></label><button disabled={busy}>로그인</button></form>}
  {userEmail&&<p className="inbox-account">{userEmail} · {member?roleNames[member.role]:'권한 확인 필요'}</p>}
  {member&&<>
   <section className="inbox-tools"><label>검수 요청 올리기<input aria-label="검수 요청 올리기" type="file" accept=".json,application/json" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void send(file)}}/></label><button disabled={busy} onClick={()=>client&&refresh(client)}>새로고침</button><p>편집기에서 만든 검수 요청 파일을 선택하세요. 같은 파일로 업로드를 재시도할 수 있어요.</p></section>
   <div className="inbox-workspace"><section className="inbox-list" aria-label="검수 요청 목록"><h2>최근 요청 <small>{rows.length}</small></h2>{!rows.length&&<p>아직 접수된 요청이 없어요.</p>}{rows.map(row=><button key={row.digest} disabled={busy} aria-pressed={selected?.digest===row.digest} onClick={()=>open(row)}><strong>{title(row)}</strong><span>{status(row)}</span><small>{row.digest.slice(0,12)}</small></button>)}</section>
    <section className="inbox-detail" aria-label="검수 상세">{!selected?<p>확인할 그림을 선택하세요.</p>:<><div className="inbox-detail-title"><h2>{title(selected)}</h2><span>{status(selected)}</span></div><p className="inbox-version">내용 버전 {selected.digest.slice(0,12)}</p>
     {preview&&<><div className="studio-pictures">{preview.images.map((im,side)=><RegionSurface key={im.url} source={im.url} size={preview.draft.resolution} regions={preview.draft.regions} selected={null} drawing={false} heatmap={null} side={side} onSelect={()=>{}} onDraw={()=>{}}/>)}</div><button disabled={busy} onClick={saveFile}>검수 파일 내려받기</button><p>영역 {preview.draft.regions.length}개 · 파일을 편집기에서 열어 직접 플레이해 볼 수 있어요.</p></>}
     {check?<p className={check.passed?'inbox-check-pass':'inbox-check-fail'}>{check.passed?'서버 이미지 검사 통과':'서버 이미지 검사 수정 필요'} · {check.message}</p>:<p>서버 이미지 검사 대기 중이에요. 검사 전에는 승인할 수 없어요.</p>}
     {decision?<section className="inbox-decision"><h3>{decision.decision==='approved'?'승인 결과':'반려 결과'}</h3><p>{decision.note}</p><small>기록된 결정은 덮어쓸 수 없어요.</small></section>:reviewer&&selected.upload_complete?<div className="inbox-decision"><label>검수 메모<textarea aria-label="검수 메모" maxLength={2000} value={note} disabled={busy} onChange={e=>setNote(e.target.value)} placeholder="확인한 내용이나 수정할 부분을 적어 주세요."/></label><div><button disabled={busy||!preview||!check?.passed||!note.trim()} onClick={()=>decide('approved')}>이 버전 승인</button><button disabled={busy||!note.trim()} onClick={()=>decide('rejected')}>수정 요청 · 반려</button></div></div>:!reviewer&&<p>검수자 또는 관리자 계정에서 승인·반려할 수 있어요.</p>}
    </>}</section></div>
  </>}
  {busy&&member&&<p role="status" className="inbox-progress">처리하고 있어요…</p>}{message&&<p role="status" className="inbox-message">{message}</p>}
 </main>;
}
