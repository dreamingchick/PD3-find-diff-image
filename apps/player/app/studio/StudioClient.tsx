"use client";
import {useEffect,useRef,useState} from 'react';
import {stages} from '../stages';
import {CHANGE_TYPES,REQUIRED,parseDraft,parsePackage,validateDraft,scanPixels,pixelReport,canonicalContent,reviewReadiness} from '../../../../packages/studio-core/index.mjs';
import type {Draft,Level,ChangeType,Scan} from '../../../../packages/studio-core/index.mjs';
import {listDrafts,readDraft,saveDraft,deleteDraft} from './drafts';
import type {DraftIndex,DraftRecord} from './drafts';
import {decodeImage,fromCatalog,dataUrl,fromDataUrl} from './images';
import type {LoadedImage} from './images';
import RegionSurface from './RegionSurface';
import StudioPreview from './StudioPreview';

type Pair=[LoadedImage|null,LoadedImage|null];
type Report=Scan&{passed:boolean};
const labels:Record<Level,string>={easy:'쉬움',normal:'보통',hard:'어려움'};
const changes:Record<ChangeType,string>={unclassified:'미지정',add:'추가',remove:'삭제',color:'색상',size:'크기',move:'위치',rotate:'회전',shape:'형태',detail:'디테일',count:'수량'};
const blank=(id='new-draft'):Draft=>({id,title:'새 그림',chapter:'제작 초안',notes:'',difficulty:'easy',limit:120,resolution:256,regions:[]});
const errorText=(e:unknown)=>e instanceof Error?e.message:'작업을 완료하지 못했어요.';
export default function StudioClient(){
 const [draft,setDraft]=useState<Draft>(()=>blank()),[images,setImages]=useState<Pair>([null,null]),[workspace,setWorkspace]=useState(''),[ready,setReady]=useState(false),[dirty,setDirty]=useState(false);
 const [saved,setSaved]=useState('초안 준비 중'),[drafts,setDrafts]=useState<DraftIndex[]>([]),[chosen,setChosen]=useState(''),[catalog,setCatalog]=useState(stages[0].id);
 const [selected,setSelected]=useState<number|null>(null),[drawing,setDrawing]=useState(false),[busy,setBusy]=useState<'loading'|'checking'|'exporting'|null>(null),[message,setMessage]=useState('이미지를 두 장 선택하거나 기존 그림에서 시작하세요.');
 const [report,setReport]=useState<Report|null>(null),[heatmap,setHeatmap]=useState<string|null>(null),[showHeatmap,setShowHeatmap]=useState(false),[reviewed,setReviewed]=useState(false),[preview,setPreview]=useState(false),[percent,setPercent]=useState(0),[leaveAnyway,setLeaveAnyway]=useState(false);
 const [played,setPlayed]=useState(false),[requested,setRequested]=useState<string|null>(null);
 const alive=useRef(true),revision=useRef(0),run=useRef(0),assets=useRef<Pair>(images),map=useRef<string|null>(null),removeDialog=useRef<HTMLDialogElement>(null);
 const snapshot=useRef({draft,images,workspace,dirty});snapshot.current={draft,images,workspace,dirty};assets.current=images;
 const issues=validateDraft(draft),hasImages=Boolean(images[0]&&images[1]),selectedRegion=draft.regions.find(r=>r.id===selected),locked=!ready||busy!==null;
 const reviewReasons=reviewReadiness(draft,report,played,reviewed);
 function clearReport(){run.current++;setReport(null);setReviewed(false);setPlayed(false);setRequested(null);setShowHeatmap(false);if(map.current){URL.revokeObjectURL(map.current);map.current=null}setHeatmap(null)}
 function change(next:Draft){revision.current++;setDraft(next);setDirty(true);setSaved('저장 대기');clearReport()}
 function commit(next:Draft,pair:Pair,key:string,restored=false){
  if(!alive.current){pair.forEach(i=>i&&URL.revokeObjectURL(i.url));return}
  for(const old of assets.current)if(old&&!pair.some(i=>i?.url===old.url))URL.revokeObjectURL(old.url);
  assets.current=pair;revision.current++;setDraft(next);setImages(pair);setWorkspace(key);setChosen(key);setSelected(null);setDrawing(false);setDirty(!restored);setSaved(restored?'자동 저장됨':'저장 대기');clearReport();
 }
 async function refresh(){const list=await listDrafts();if(alive.current)setDrafts(list)}
 async function persist(){
  const state=snapshot.current;if(!state.workspace)return;const rev=revision.current;
  const record:DraftRecord={key:state.workspace,draft:parseDraft(state.draft),images:state.images.map(i=>i?{name:i.name,blob:i.blob,sha256:i.sha256}:null) as DraftRecord['images'],updatedAt:Date.now()};
  await saveDraft(record);
  if(alive.current&&snapshot.current.workspace===state.workspace&&revision.current===rev){snapshot.current.dirty=false;setDirty(false);setSaved('자동 저장됨')}
  await refresh();
 }
 async function loadRecord(record:DraftRecord){
  const doc=parseDraft(record.draft);if(!Array.isArray(record.images)||record.images.length!==2)throw Error('초안 이미지 정보가 올바르지 않아요.');
  const pair:Pair=[null,null];try{for(let i=0;i<2;i++){const stored=record.images[i];if(stored){pair[i]=await decodeImage(stored.blob,stored.name);if(pair[i]!.sha256!==stored.sha256)throw Error('저장된 이미지가 바뀌었어요.')}}if(pair.some(i=>i&&i.width!==doc.resolution))throw Error('그림 크기를 다시 확인해 주세요.');commit(doc,pair,record.key,true)}catch(e){pair.forEach(i=>i&&URL.revokeObjectURL(i.url));throw e}
 }
 useEffect(()=>{
  alive.current=true;let active=true;
  (async()=>{try{const list=await listDrafts();if(!alive.current||!active)return;setDrafts(list);if(list[0]){const record=await readDraft(list[0].key);if(record){await loadRecord(record);setMessage('저장된 초안을 복원했어요. 내보내기 전에 다시 검사해 주세요.')}}else{const key='local-'+crypto.randomUUID();setWorkspace(key);setDraft(blank('draft-'+key.slice(-8)));setSaved('새 초안')}}catch(e){setMessage(errorText(e));setWorkspace('local-'+crypto.randomUUID());setSaved('저장소를 확인해 주세요.')}finally{if(alive.current&&active)setReady(true)}})();
  return()=>{active=false;alive.current=false;run.current++;assets.current.forEach(i=>i&&URL.revokeObjectURL(i.url));if(map.current)URL.revokeObjectURL(map.current)};
 },[]);
 useEffect(()=>{if(!ready||!dirty||!workspace)return;const t=setTimeout(()=>{persist().catch(()=>{if(alive.current)setSaved('자동 저장 실패 · 내보내기로 보관하세요.')})},600);return()=>clearTimeout(t)},[ready,dirty,draft,images,workspace]);
 useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{if(snapshot.current.dirty){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[dirty]);
 async function fresh(){if(locked)return;try{if(dirty)await persist();const key='local-'+crypto.randomUUID();commit(blank('draft-'+key.slice(-8)),[null,null],key);setMessage('새 초안을 만들었어요.');setSaved('새 초안');setDirty(false)}catch(e){setMessage(errorText(e))}}
 async function openSaved(){if(!chosen||locked)return;setBusy('loading');try{if(dirty)await persist();const record=await readDraft(chosen);if(!record)throw Error('초안을 찾을 수 없어요.');await loadRecord(record);setMessage('초안을 열었어요. 검사 결과는 다시 확인해 주세요.')}catch(e){setMessage(errorText(e))}finally{if(alive.current)setBusy(null)}}
 async function openCatalog(){
  setBusy('loading');let pair:Pair=[null,null];
  try{
   if(dirty)await persist();const s=stages.find(s=>s.id===catalog)!;
   pair[0]=await fromCatalog(s.images[0],s.id+'-original');pair[1]=await fromCatalog(s.images[1],s.id+'-modified');
   if(pair[0].width!==pair[1].width)throw Error('두 그림의 크기가 달라요.');
   const size=pair[0].width,difficulty=(Object.entries(REQUIRED).find(([,n])=>n===s.answers.length)?.[0]??'easy') as Level;
   const regions=s.answers.map(a=>{
    const b=a.hitboxes?.[0],other=a.hitboxes?.[1];let box:[number,number,number,number];
    if(b){if(b.shape!=='rect'||other?.shape!=='rect'||JSON.stringify(b)!==JSON.stringify(other))throw Error('이 버전에서는 두 그림에 공통인 사각 영역을 편집할 수 있어요.');box=[Math.round(b.x*size),Math.round(b.y*size),Math.round((b.x+b.w)*size),Math.round((b.y+b.h)*size)]}
    else box=[Math.max(0,Math.round((a.x-a.r)*size)),Math.max(0,Math.round((a.y-a.r)*size)),Math.min(size,Math.round((a.x+a.r)*size)),Math.min(size,Math.round((a.y+a.r)*size))];
    return {id:a.id,box,difficulty:(['easy','normal','hard'].includes(a.difficulty??'')?a.difficulty:difficulty) as Level,changeType:'unclassified' as const};
   });
   commit({id:s.id,title:s.title.replace(' (검수용)',''),chapter:s.chapter??'제작 초안',notes:'',difficulty,limit:s.limit,resolution:size,regions},pair,'local-'+crypto.randomUUID());pair=[null,null];setMessage('기존 그림을 새 초안으로 열었어요. 실제 게임은 바뀌지 않아요.');
  }catch(e){pair.forEach(i=>i&&URL.revokeObjectURL(i.url));setMessage(errorText(e))}finally{if(alive.current)setBusy(null)}
 }
 async function chooseImage(file:File,side:number){setBusy('loading');let image:LoadedImage|null=null;try{image=await decodeImage(file,file.name);const other=images[1-side];if(other&&other.width!==image.width)throw Error('두 그림의 크기가 같아야 해요. 다른 크기는 새 초안에서 시작하세요.');const next:Pair=[...images];next[side]=image;commit({...draft,resolution:image.width},next,workspace);image=null;setMessage('이미지를 선택했어요. 정답 영역을 표시해 주세요.')}catch(e){if(image)URL.revokeObjectURL(image.url);setMessage(errorText(e))}finally{if(alive.current)setBusy(null)}}
 async function importFile(file:File){
  if(file.size>50*1024*1024){setMessage('초안 파일은 50MB까지 열 수 있어요.');return}
  setBusy('loading');let pair:Pair=[null,null];try{const parsed=parsePackage(await file.text());for(let i=0;i<2;i++)pair[i]=await fromDataUrl(parsed.images[i].data,parsed.images[i].name,parsed.images[i].sha256);if(pair.some(i=>i!.width!==parsed.draft.resolution))throw Error('초안과 이미지 크기가 맞지 않아요.');if(dirty)await persist();commit(parsed.draft,pair,'local-'+crypto.randomUUID());pair=[null,null];setMessage('검수 초안을 불러왔어요. 이미지와 정답을 다시 검사해 주세요.')}catch(e){pair.forEach(i=>i&&URL.revokeObjectURL(i.url));setMessage(errorText(e))}finally{if(alive.current)setBusy(null)}
 }
 async function inspect(){
  if(!hasImages||locked)return;if(issues.errors.length){setMessage('제목·시간·정답 영역 오류를 먼저 확인해 주세요.');return}
  const token=++run.current,doc=draft,a=images[0]!,b=images[1]!,size=doc.resolution,total=size*size;
  setBusy('checking');setPercent(0);setReport(null);setReviewed(false);setPlayed(false);setRequested(null);const mask=new Uint8ClampedArray(total*4),sum:Scan={outsideChanged:0,totalChanged:0,transparent:0,regionChanged:doc.regions.map(()=>0)};
  try{
   for(let start=0;start<total;start+=65536){if(token!==run.current||!alive.current)return;const part=scanPixels(a.pixels.data,b.pixels.data,size,size,doc.regions,start,Math.min(total,start+65536),mask);sum.outsideChanged+=part.outsideChanged;sum.totalChanged+=part.totalChanged;sum.transparent+=part.transparent;sum.regionChanged=sum.regionChanged.map((n,i)=>n+part.regionChanged[i]);setPercent(Math.round(Math.min(total,start+65536)/total*100));await new Promise<void>(resolve=>setTimeout(resolve,0))}
   if(token!==run.current||!alive.current)return;
   const result=pixelReport(sum),canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;canvas.getContext('2d')!.putImageData(new ImageData(mask,size,size),0,0);
   const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('차이 표시를 만들지 못했어요.')),'image/png'));
   if(token!==run.current||!alive.current)return;if(map.current)URL.revokeObjectURL(map.current);map.current=URL.createObjectURL(blob);setHeatmap(map.current);setReport(result);
   setMessage(result.passed?'픽셀 검사 통과 · 플레이로 정답 영역도 확인하세요.':'픽셀 검사에서 수정할 부분을 찾았어요. 변경 픽셀 표시를 켜서 확인하세요.');
  }catch(e){if(token===run.current)setMessage(errorText(e))}finally{if(token===run.current&&alive.current)setBusy(null)}
 }
 async function exportFile(requestReview=false){
  if(!report?.passed||issues.errors.length||!hasImages||locked||requestReview&&reviewReasons.length)return;
  setBusy('exporting');const rev=revision.current;
  try{const files=await Promise.all(images.map(async im=>({name:im!.name,sha256:im!.sha256,data:await dataUrl(im!.blob)})));
   if(!alive.current||rev!==revision.current)return;
   const raw=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalContent(draft,files))),digest=[...new Uint8Array(raw)].map(v=>v.toString(16).padStart(2,'0')).join('');
   if(!alive.current||rev!==revision.current)return;
   const artifact={format:'pd3-studio-draft',version:1,visibility:'private',draft:parseDraft(draft),images:files,qa:{...report,semanticReview:reviewed&&!issues.warnings.length?'confirmed':'pending'},...(requestReview?{reviewRequest:{version:1,contentDigest:digest,requestedAt:new Date().toISOString(),testPlayCleared:true,semanticReviewConfirmed:true}}:{})};
   const url=URL.createObjectURL(new Blob([JSON.stringify(artifact)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=draft.id+(requestReview?'.review':'.pd3')+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);if(requestReview)setRequested(digest);setMessage(requestReview?'검수 요청 파일을 만들었어요. 비공개 검수함에 전달한 뒤 별도 승인이 필요해요.':'비공개 검수 초안을 내보냈어요. 이미지와 정답이 포함되어 있으니 비공개로 보관하세요.');
  }catch(e){setMessage(errorText(e))}finally{if(alive.current)setBusy(null)}
 }
 async function leave(destination='/'){try{if(dirty)await persist();window.location.assign(destination)}catch{setLeaveAnyway(true);setMessage('초안을 저장하지 못했어요. 먼저 내보내거나 저장 없이 메인으로 이동할 수 있어요.')}}
 function addBox(box:[number,number,number,number]){if(draft.regions.length>=7||locked)return;const id=Math.max(0,...draft.regions.map(r=>r.id))+1;change({...draft,regions:[...draft.regions,{id,box,difficulty:draft.difficulty,changeType:'unclassified'}]});setSelected(id);setDrawing(false)}
 function editBox(field:number,value:number){if(!selectedRegion)return;const [x,y,x1,y1]=selectedRegion.box,w=x1-x,h=y1-y,v=Math.round(Number.isFinite(value)?value:0);const box:[number,number,number,number]=field===0?[v,y,v+w,y1]:field===1?[x,v,x1,v+h]:field===2?[x,y,x+v,y1]:[x,y,x1,y+v];change({...draft,regions:draft.regions.map(r=>r.id===selected?{...r,box}:r)})}
 return <main className="studio-shell">
  <header className="studio-header"><div><span className="eyebrow">PRIVATE CONTENT WORKSPACE</span><h1>PD3 Studio <small>비공개 제작</small></h1></div><span className="studio-save" role="status">{saved}</span><a className="studio-server-link" href="/studio/reviews" onClick={e=>{e.preventDefault();void leave('/studio/reviews')}}>서버 검수함</a><button onClick={()=>leave()}>메인으로</button></header>
  <section className="studio-intro"><h2>그림 한 쌍을, 새로운 발견으로.</h2><p>영역을 그리고 차이를 검사한 뒤 직접 플레이해 보세요. 초안은 이 브라우저에 저장되며 실제 게임은 바뀌지 않아요.</p></section>
  <section className="studio-loaders" aria-label="초안 관리"><button disabled={locked} onClick={fresh}>새 초안</button><label>기존 그림<select aria-label="기존 그림" disabled={locked} value={catalog} onChange={e=>setCatalog(e.target.value)}>{stages.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label><button disabled={locked} onClick={openCatalog}>기존 그림 불러오기</button><label>저장된 초안<select aria-label="저장된 초안" disabled={locked} value={chosen} onChange={e=>setChosen(e.target.value)}><option value="">초안 선택</option>{drafts.map(d=><option key={d.key} value={d.key}>{d.title||'제목 없음'} · {d.stageId}</option>)}</select></label><button disabled={locked||!chosen} onClick={openSaved}>초안 열기</button><button disabled={locked||!drafts.some(d=>d.key===chosen)} onClick={()=>removeDialog.current?.showModal()}>초안 삭제</button><label className="studio-file">검수 초안 불러오기<input aria-label="검수 초안 불러오기" type="file" accept=".json,application/json" disabled={locked} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void importFile(f)}}/></label></section>
  <details className="studio-metadata" open><summary>그림 정보</summary><fieldset disabled={locked}><label>그림 ID<input aria-label="그림 ID" value={draft.id} maxLength={80} onChange={e=>change({...draft,id:e.target.value})}/></label><label>제목<input aria-label="제목" value={draft.title} maxLength={120} onChange={e=>change({...draft,title:e.target.value})}/></label><label>챕터<input value={draft.chapter} maxLength={80} onChange={e=>change({...draft,chapter:e.target.value})}/></label><label>난이도<select aria-label="그림 난이도" value={draft.difficulty} onChange={e=>change({...draft,difficulty:e.target.value as Level})}>{Object.entries(labels).map(([v,label])=><option value={v} key={v}>{label} · {REQUIRED[v as Level]}개</option>)}</select></label><label>도전 시간(초)<input type="number" min={10} max={3600} value={draft.limit} onChange={e=>change({...draft,limit:Math.round(Number(e.target.value))})}/></label><label className="studio-notes">제작 메모<textarea value={draft.notes} maxLength={2000} onChange={e=>change({...draft,notes:e.target.value})}/></label></fieldset></details>
  <div className="studio-workspace"><section className="studio-board" aria-label="이미지와 영역 편집"><div className="studio-assets">{[0,1].map(side=><label key={side}>{side?'변형 이미지':'원본 이미지'}<input aria-label={side?'변형 이미지':'원본 이미지'} type="file" accept="image/png,image/webp" disabled={locked} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void chooseImage(f,side)}}/><small>{images[side]?`${images[side]!.name} · ${images[side]!.width} × ${images[side]!.height}`:'PNG·WebP / 정사각형 / 256~2048px / 16MB 이하'}</small></label>)}</div>
   <div className="studio-draw-tools"><button disabled={locked||!hasImages||draft.regions.length>=7} aria-pressed={drawing} onClick={()=>setDrawing(v=>!v)}>{drawing?'그리기 취소':'영역 그리기'}</button><span>{drawing?'그림 위를 끌어 사각 영역을 만드세요.':'두 그림에 같은 영역이 표시돼요.'}</span>{heatmap&&<label><input type="checkbox" checked={showHeatmap} onChange={e=>setShowHeatmap(e.target.checked)}/>변경 픽셀 표시</label>}</div>
   <div className="studio-pictures">{[0,1].map(side=>images[side]?<RegionSurface key={side} source={images[side]!.url} size={draft.resolution} regions={draft.regions} selected={selected} drawing={drawing&&!locked} heatmap={showHeatmap?heatmap:null} side={side} onSelect={setSelected} onDraw={addBox}/>:<div className="studio-empty" key={side}><span>{side?'변형 그림':'원본 그림'}</span><p>이미지를 선택해 주세요.</p></div>)}</div>
  </section><aside className="studio-inspector"><div className="studio-region-heading"><h2>정답 영역</h2><span>{draft.regions.length} / {REQUIRED[draft.difficulty]}개</span></div><div className="studio-region-list">{draft.regions.map(r=><button key={r.id} disabled={locked} aria-pressed={selected===r.id} onClick={()=>setSelected(r.id)}>정답 {r.id}<small>{labels[r.difficulty]} · {changes[r.changeType]}</small></button>)}{!draft.regions.length&&<p>‘영역 그리기’를 누른 뒤 바뀐 곳을 표시하세요.</p>}</div>
   {selectedRegion&&<fieldset className="studio-region-fields" disabled={locked}><legend>정답 {selectedRegion.id} 편집</legend><div className="studio-coordinates">{['X','Y','폭','높이'].map((label,i)=><label key={label}>{label}<input aria-label={`영역 ${label}`} type="number" min={0} max={draft.resolution} value={i===0?selectedRegion.box[0]:i===1?selectedRegion.box[1]:i===2?selectedRegion.box[2]-selectedRegion.box[0]:selectedRegion.box[3]-selectedRegion.box[1]} onChange={e=>editBox(i,Number(e.target.value))}/></label>)}</div><label>정답 난이도<select aria-label="정답 난이도" value={selectedRegion.difficulty} onChange={e=>change({...draft,regions:draft.regions.map(r=>r.id===selected?{...r,difficulty:e.target.value as Level}:r)})}>{Object.entries(labels).map(([v,label])=><option value={v} key={v}>{label}</option>)}</select></label><label>변경 유형<select aria-label="변경 유형" value={selectedRegion.changeType} onChange={e=>change({...draft,regions:draft.regions.map(r=>r.id===selected?{...r,changeType:e.target.value as ChangeType}:r)})}>{CHANGE_TYPES.map(v=><option key={v} value={v}>{changes[v]}</option>)}</select></label><button className="studio-danger" onClick={()=>{change({...draft,regions:draft.regions.filter(r=>r.id!==selected)});setSelected(null)}}>선택 정답 삭제</button></fieldset>}
   {(hasImages||draft.regions.length>0)&&<ul className="studio-issues">{issues.errors.map((e,i)=><li key={'e'+i}>{e.message}</li>)}{issues.warnings.map((e,i)=><li className="warning" key={'w'+i}>{e.message}</li>)}</ul>}
   <section className="studio-checks" aria-label="검사 결과"><h2>검사와 테스트</h2><button disabled={locked||!hasImages} onClick={inspect}>픽셀 차이 검사</button>{busy==='checking'&&<><progress value={percent} max={100} aria-label="픽셀 검사 진행"/><button onClick={()=>{run.current++;setBusy(null);setMessage('검사를 취소했어요.')}}>검사 취소</button></>}{report&&<div className={report.passed?'studio-pass':'studio-fail'}><strong>{report.passed?'픽셀 검사 통과':'픽셀 검사 수정 필요'}</strong><p>정답 밖에서 바뀐 픽셀 {report.outsideChanged.toLocaleString()}개</p>{report.transparent>0&&<p>투명 배경은 지원하지 않아요.</p>}{draft.regions.map((r,i)=><p key={r.id}>정답 {r.id} · 변화 {report.regionChanged[i].toLocaleString()}개</p>)}</div>}<label className="studio-review"><input type="checkbox" disabled={!report?.passed||issues.warnings.length>0||locked} checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>그림과 변경 유형을 직접 확인했어요.</label><button disabled={locked||!report?.passed} onClick={()=>setPreview(true)}>플레이 테스트</button><button className="studio-export" disabled={locked||!report?.passed||issues.errors.length>0} onClick={()=>exportFile()}>검수 초안 내보내기</button><p>이미지와 정답이 포함된 비공개 파일을 만들어요. 실제 게임에는 자동으로 반영되지 않아요.</p>
    <section className="studio-review-request" aria-label="검수 요청"><h3>승인 전 검수</h3><p>{played?'플레이 테스트 완료':'플레이 테스트 미완료'}</p>
     {reviewReasons.length>0&&<ul>{reviewReasons.map((reason,i)=><li key={i}>{reason}</li>)}</ul>}
     <button disabled={locked||!hasImages||reviewReasons.length>0} onClick={()=>exportFile(true)}>검수 요청 파일 만들기</button>
     {requested&&<p role="status">검수 요청 파일 생성됨 · 승인 대기<br/><code>{requested.slice(0,12)}</code></p>}
     <p>파일을 비공개 검수함에 전달해 주세요. 서버 접수나 승인은 자동으로 처리되지 않아요. 수정하면 새 버전으로 다시 검사해야 해요.</p>
    </section></section>
  </aside></div>
  <p className="studio-message" role="status">{message}</p>{leaveAnyway&&<button onClick={()=>{setDirty(false);setTimeout(()=>window.location.assign('/'),0)}}>저장 없이 메인으로</button>}
  <dialog ref={removeDialog} className="studio-delete-dialog" aria-labelledby="delete-title"><h2 id="delete-title">이 초안을 삭제할까요?</h2><p>이 기기에 저장된 초안만 삭제돼요. 원본 게임은 바뀌지 않아요.</p><button onClick={()=>removeDialog.current?.close()}>취소</button><button onClick={async()=>{const key=chosen;removeDialog.current?.close();setBusy('loading');try{if(key===workspace){run.current++;commit(blank('draft-'+crypto.randomUUID().slice(-8)),[null,null],'local-'+crypto.randomUUID(),true);setDirty(false)}await deleteDraft(key);setChosen('');await refresh();setMessage('초안을 삭제했어요.')}catch(e){setMessage(errorText(e))}finally{setBusy(null)}}}>초안 삭제 확인</button></dialog>
  {preview&&images[0]&&images[1]&&<StudioPreview draft={draft} sources={[images[0].url,images[1].url]} onClose={cleared=>{setPlayed(p=>p||cleared);setPreview(false)}}/>}
 </main>;
}
