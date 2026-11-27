"use client";
import {useEffect,useRef,useState} from "react";
import PuzzleCanvas from "./PuzzleCanvas";
import {answers,judge,zoomView} from "../../../packages/game-engine/index.mjs";
export default function Page(){
const [found,setFound]=useState<number[]>([]),[wrong,setWrong]=useState(0),[hint,setHint]=useState<number|null>(null),[used,setUsed]=useState(false),[message,setMessage]=useState(""),[mode,setMode]=useState("normal"),[elapsed,setElapsed]=useState(0);
const [view,setView]=useState({z:1,x:0,y:0}),[ready,setReady]=useState([false,false]),[error,setError]=useState(false);
const loaded=ready.every(Boolean);
const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
const remaining=Math.max(0,120-elapsed-wrong*5),clear=found.length===5,failed=mode==="challenge"&&remaining===0;
useEffect(()=>{if(!loaded||clear||failed)return;const t=setInterval(()=>setElapsed(v=>v+1),1000);return()=>clearInterval(t)},[clear,failed,mode,loaded]);
useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current)},[]);
function reset(m=mode){if(timer.current)clearTimeout(timer.current);setView({z:1,x:0,y:0});setMode(m);setFound([]);setWrong(0);setHint(null);setUsed(false);setMessage("");setElapsed(0)}
function hit(x:number,y:number,side:number){if(!loaded||clear||failed)return;const a=judge(x,y,found,answers,side);if(a.kind==="correct"&&a.id!==undefined){setFound(p=>p.includes(a.id!)?p:[...p,a.id!]);setMessage("정답!");if(hint===a.id)setHint(null)}else if(a.kind==="duplicate")setMessage("이미 발견한 정답");else if(a.kind==="wrong"){setWrong(p=>p+1);setMessage(mode==="challenge"?"오답 · 5초 차감":"오답")}}
return <main><header><h1>PD3 · 그림 속 작은 발견</h1><p>개발용 샘플 퍼즐 · 공식 랭킹 미연동</p></header><div className="controls"><button onClick={()=>reset("normal")} aria-pressed={mode==="normal"}>일반</button><button onClick={()=>reset("challenge")} aria-pressed={mode==="challenge"}>도전</button><strong>{found.length}/5 · {mode==="challenge"?remaining:elapsed}초</strong></div><section className="pair">{[0,1].map(side=><PuzzleCanvas key={side} side={side} view={view} setView={setView} found={found} hint={hint} onHit={hit} onReady={(i,ok)=>{setReady(p=>p.map((v,j)=>i===j?ok:v));if(!ok)setError(true)}}/>)}</section><div className="controls"><button onClick={()=>setView(v=>zoomView(v,v.z/1.25))}>축소</button><strong>{Math.round(view.z*100)}%</strong><button onClick={()=>setView(v=>zoomView(v,v.z*1.25))}>확대</button><button onClick={()=>setView({z:1,x:0,y:0})}>배율 초기화</button></div>{!loaded&&<p role="status">{error?"이미지 로딩 실패 · 페이지를 새로고침하세요":"이미지 로딩 중"}</p>}<div className="controls"><button disabled={!loaded||used||clear||failed} onClick={()=>{const a=answers.filter(a=>!found.includes(a.id));setHint(a[Math.floor(Math.random()*a.length)].id);setUsed(true);timer.current=setTimeout(()=>setHint(null),3000)}}>힌트 {used?0:1}</button><button onClick={()=>reset()}>다시 시작</button></div><p role="status">{clear?"모든 정답 발견!":failed?"시간 초과":message}</p><p>오답 {wrong}회</p></main>
}