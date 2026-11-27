"use client";
import {useEffect,useRef,useState} from "react";
import PuzzleCanvas from "./PuzzleCanvas";
import StageLobby from "./StageLobby";
import {unlocked,resumeSession} from "../../../packages/game-engine/progress.mjs";
import {judge,zoomView} from "../../../packages/game-engine/index.mjs";
import {evaluate,record} from "../../../packages/game-engine/rewards.mjs";
import {stages} from "./stages";
import {empty,load,save} from "./storage";
import type {Progress} from "./storage";

export default function Page(){
 const [progress,setProgress]=useState<Progress>(empty),[hydrated,setHydrated]=useState(false),[storageError,setStorageError]=useState(false);
 const [screen,setScreen]=useState<"home"|"play">("home"),[stageId,setStageId]=useState(stages[0].id),[mode,setMode]=useState("normal"),[attempt,setAttempt]=useState(0);
 const stage=stages.find(s=>s.id===stageId)??stages[0],answers=stage.answers,key=stage.id+":"+mode;
 const [found,setFound]=useState<number[]>([]),[wrong,setWrong]=useState(0),[hint,setHint]=useState<number|null>(null),[used,setUsed]=useState(false),[message,setMessage]=useState(""),[elapsed,setElapsed]=useState(0);
 const [view,setView]=useState({z:1,x:0,y:0}),[ready,setReady]=useState([false,false]),[error,setError]=useState(false),[exploring,setExploring]=useState(false),[menuOpen,setMenuOpen]=useState(false);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null),recorded=useRef(false),menuRef=useRef<HTMLDialogElement>(null);
 const remaining=Math.max(0,stage.limit-elapsed-wrong*5),clear=found.length===answers.length,failed=!clear&&mode==="challenge"&&remaining===0,loaded=screen==="play"&&hydrated&&ready.every(Boolean);
 const result=evaluate({answers,found,wrong,hints:Number(used),mode,remaining,cleared:clear});
 useEffect(()=>{let active=true;load().then(p=>{if(active)setProgress(p)}).catch(()=>{if(active)setStorageError(true)}).finally(()=>{if(active)setHydrated(true)});return()=>{active=false}},[]);
 useEffect(()=>{if(!loaded||clear||failed||menuOpen||exploring)return;const t=setInterval(()=>setElapsed(v=>v+1),1000);return()=>clearInterval(t)},[loaded,clear,failed,attempt,menuOpen]);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current)},[]);
 useEffect(()=>{if(!hydrated||screen!=="play"||mode!=="normal")return;setProgress(p=>{const sessions={...p.sessions};if(clear)delete sessions[stageId];else sessions[stageId]={found,wrong,used,elapsed};return {...p,sessions}})},[hydrated,screen,mode,stageId,found,wrong,used,elapsed,clear]);
 useEffect(()=>{if(!hydrated||screen!=="play"||!clear||recorded.current)return;recorded.current=true;const entry={score:result.score,stars:result.stars,elapsed,wrong,hints:Number(used)};setProgress(p=>({...p,records:{...p.records,[key]:record(p.records[key],entry)}}))},[hydrated,screen,clear,key,result.score,result.stars,elapsed,wrong,used]);
 useEffect(()=>{if(hydrated)save(progress).catch(()=>setStorageError(true))},[hydrated,progress]);
 useEffect(()=>{if(menuOpen)menuRef.current?.showModal();else menuRef.current?.close()},[menuOpen]);
 function reset(id=stageId,m=mode,resume=false,data=progress){
  if(!unlocked(data.records,stages,id))return false;
  if(timer.current)clearTimeout(timer.current);recorded.current=false;
  setAttempt(v=>v+1);setStageId(id);setMode(m);setReady([false,false]);setError(false);setView({z:1,x:0,y:0});setExploring(false);
  const s=resume&&m==="normal"?resumeSession(data,stages.find(s=>s.id===id)!):undefined;
  setFound(s?.found??[]);setWrong(s?.wrong??0);setUsed(s?.used??false);setElapsed(s?.elapsed??0);setHint(null);setMessage("");setMenuOpen(false);return true;
 }
 function start(id:string,m:string,push=true){if(!hydrated||!reset(id,m,true))return;setScreen("play");if(push)window.history.pushState({pd3Stage:id,pd3Mode:m},"","#play");window.scrollTo({top:0})}
 function home(back=true){
  if(mode==="normal"&&!clear)setProgress(p=>({...p,sessions:{...p.sessions,[stageId]:{found,wrong,used,elapsed}}}));
  if(timer.current)clearTimeout(timer.current);setHint(null);setMenuOpen(false);setScreen("home");
  if(back&&window.history.state?.pd3Stage)window.history.back();window.scrollTo({top:0});
 }
 const navigation=useRef<(event:PopStateEvent)=>void>(()=>{});
 navigation.current=e=>{if(e.state?.pd3Stage)start(e.state.pd3Stage,e.state.pd3Mode,false);else if(screen==="play")home(false)};
 useEffect(()=>{if(window.location.hash==="#play")window.history.replaceState(null,"",window.location.pathname+window.location.search);const pop=(e:PopStateEvent)=>navigation.current(e);window.addEventListener("popstate",pop);return()=>window.removeEventListener("popstate",pop)},[]);
 function hit(x:number,y:number,side:number){if(!loaded||clear||failed||menuOpen||exploring)return;const a=judge(x,y,found,answers,side);if(a.kind==="correct"&&a.id!==undefined){setFound(p=>p.includes(a.id!)?p:[...p,a.id!]);setMessage("정답!");if(hint===a.id)setHint(null)}else if(a.kind==="duplicate")setMessage("이미 발견한 정답");else if(a.kind==="wrong"){setWrong(p=>p+1);setMessage(mode==="challenge"?"오답 · 5초 차감":"오답")}}
 function giveHint(){const available=answers.filter(a=>!found.includes(a.id));if(!loaded||used||clear||failed||!available.length)return;setHint(available[Math.floor(Math.random()*available.length)].id);setUsed(true);timer.current=setTimeout(()=>setHint(null),3000)}
 if(screen==="home")return <StageLobby progress={progress} hydrated={hydrated} storageError={storageError} mode={mode} onMode={setMode} onStart={start} onRestore={p=>{setProgress(p);reset(stages[0].id,"normal",true,p)}}/>;
 const next=stages[stages.findIndex(s=>s.id===stage.id)+1];
 return <main className="play-screen">
  <header className="play-header"><button className="icon-button" aria-label="메인으로 돌아가기" onClick={()=>home()}>‹</button><div><h1>{stage.title.replace(" (검수용)","")}</h1><p>{mode==="normal"?"일반":"도전"} · {mode==="challenge"?remaining:elapsed}초 · {result.score.toLocaleString()}점</p></div><button className="icon-button" aria-label="플레이 메뉴" onClick={()=>setMenuOpen(true)}>☰</button></header>
  <p id="puzzle-help" className="sr-only">그림을 터치해 차이를 찾으세요. 방향키로 조준하고 Enter로 선택합니다. Shift와 방향키는 미세 이동입니다. 그림을 끌려면 확대·이동을 켜세요.</p>
  <section className="pair" aria-label="두 그림 비교">{[0,1].map(side=><div className="puzzle-frame" key={attempt+":"+side}><PuzzleCanvas source={stage.images[side]} answers={answers} side={side} view={view} setView={setView} found={found} hint={hint} exploring={exploring} onHit={hit} onReady={(i,ok)=>{setReady(p=>p.map((v,j)=>i===j?ok:v));if(!ok)setError(true)}}/></div>)}</section>
  {!loaded&&<div className="board-message" role="status"><p>{error?"그림을 불러오지 못했어요.":"그림을 불러오고 있어요."}</p>{error&&<button onClick={()=>reset(stageId,mode,true)}>이미지 다시 불러오기</button>}</div>}
  <footer className="play-footer">
   <p className="play-status" role="status">{clear?"모든 차이를 찾았어요!":failed?"시간이 끝났어요.":exploring?"그림 끌기 · 두 손가락 확대":message||"두 그림의 다른 곳을 찾아보세요."}</p>
   {exploring&&<div className="zoom-tools" aria-label="그림 확대 조작"><button aria-label="축소" onClick={()=>setView(v=>zoomView(v,v.z/1.25))}>−</button><output aria-label="배율">{Math.round(view.z*100)}%</output><button aria-label="확대" onClick={()=>setView(v=>zoomView(v,v.z*1.25))}>＋</button><button onClick={()=>setView({z:1,x:0,y:0})}>초기화</button></div>}
   <div className="play-actions"><button className="tool-button" aria-pressed={exploring} onClick={()=>{setExploring(v=>!v);setView({z:1,x:0,y:0})}}><span aria-hidden="true">⌕</span>{exploring?"찾기로 전환":"확대·이동"}</button><div className="answer-progress" role="progressbar" aria-label="찾은 정답" aria-valuemin={0} aria-valuemax={answers.length} aria-valuenow={found.length}><div className="progress-dots" aria-hidden="true">{answers.map(a=><span key={a.id} className={found.includes(a.id)?"found":""}/>)}</div><strong>{found.length}/{answers.length}</strong></div><button className="tool-button hint-button" disabled={!loaded||used||clear||failed} onClick={giveHint}><span aria-hidden="true">☀</span>힌트 {used?0:1}</button></div>
  </footer>
  {(clear||failed)&&<section className="result-card" aria-label={clear?"클리어 결과":"도전 결과"}><span className="result-stars">{clear?"★".repeat(result.stars)+"☆".repeat(3-result.stars):"다시 도전해 볼까요?"}</span><h2>{clear?`${result.score.toLocaleString()}점`:"시간 초과"}</h2><p>{clear?`오답 ${wrong}회 · 힌트 ${Number(used)}회`:`찾은 정답 ${found.length}/${answers.length}`}</p><div className="result-actions"><button onClick={()=>home()}>메인으로</button>{clear&&next&&<button disabled={!unlocked(progress.records,stages,next.id)} onClick={()=>{reset(next.id,mode);window.history.replaceState({pd3Stage:next.id,pd3Mode:mode},"","#play")}}>다음 그림</button>}{failed&&<button onClick={()=>reset(stageId,mode)}>다시 시작</button>}</div></section>}
  <dialog ref={menuRef} className="play-menu" onClose={()=>setMenuOpen(false)} aria-labelledby="play-menu-title"><h2 id="play-menu-title">잠시 쉬어 가요</h2><p>일반 진행은 메인으로 돌아가도 이어서 찾을 수 있어요.</p><p>오답 {wrong}회 · 최고 {progress.records[key]?.best.score??0}점</p><div className="menu-buttons"><button onClick={()=>setMenuOpen(false)}>계속 찾기</button><button onClick={()=>reset()}>다시 시작</button><button onClick={()=>home()}>메인으로 돌아가기</button></div><p className="keyboard-guide">키보드: 방향키로 조준 · Enter로 찾기<br/>Shift+방향키로 미세 이동</p></dialog>
 </main>;
}
