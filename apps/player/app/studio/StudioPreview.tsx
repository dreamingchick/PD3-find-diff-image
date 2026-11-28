"use client";
import {useEffect,useRef,useState} from 'react';
import PuzzleCanvas from '../PuzzleCanvas';
import {judge,clampView} from '../../../../packages/game-engine/index.mjs';
import {evaluate} from '../../../../packages/game-engine/rewards.mjs';
import {answersFromDraft} from '../../../../packages/studio-core/index.mjs';
import type {Draft} from '../../../../packages/studio-core/index.mjs';
export default function StudioPreview({draft,sources,onClose}:{draft:Draft;sources:[string,string];onClose:(cleared:boolean)=>void}){
 const dialog=useRef<HTMLDialogElement>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [answers]=useState(()=>answersFromDraft(draft)),[found,setFound]=useState<number[]>([]),[wrong,setWrong]=useState(0),[hint,setHint]=useState<number|null>(null),[used,setUsed]=useState(false),[view,setView]=useState({z:1,x:0,y:0}),[ready,setReady]=useState([false,false]),[message,setMessage]=useState('두 그림을 눌러 정답 영역을 확인하세요.');
 const clear=found.length===answers.length,result=evaluate({answers,found,wrong,hints:Number(used),mode:'normal',remaining:0,cleared:clear});
 useEffect(()=>{dialog.current?.showModal();return()=>{if(timer.current)clearTimeout(timer.current)}},[]);
 function reset(){if(timer.current)clearTimeout(timer.current);setFound([]);setWrong(0);setHint(null);setUsed(false);setView({z:1,x:0,y:0});setMessage('다시 테스트해 보세요.')}
 return <dialog ref={dialog} className="play-screen studio-test" aria-label="스테이지 테스트" onClose={()=>onClose(clear)}>
  <header className="play-header"><button className="icon-button" aria-label="편집으로 돌아가기" onClick={()=>dialog.current?.close()}>‹</button><div><h1>{draft.title}</h1><p>제작 테스트 · 보상 미지급</p></div><button className="icon-button" aria-label="테스트 다시 시작" onClick={reset}>↻</button></header>
  <p id="puzzle-help" className="sr-only">핀치·휠로 확대하고 끌어서 이동하세요. 확대 상태에서도 누르면 정답을 확인할 수 있어요. 방향키로 조준하고 Enter로 선택합니다.</p>
  <section className="pair" aria-label="테스트 그림 비교">{[0,1].map(side=><div className="puzzle-frame" key={side}><PuzzleCanvas source={sources[side]} answers={answers} side={side} view={view} setView={setView} found={found} hint={hint} onReady={(i,ok)=>{setReady(p=>p.map((v,j)=>i===j?ok:v));if(!ok)setMessage('이미지를 불러오지 못했어요.')}} onHit={(x,y,s)=>{if(!ready.every(Boolean)||clear)return;const hit=judge(x,y,found,answers,s);if(hit.kind==='correct'&&hit.id!==undefined){setFound(p=>p.includes(hit.id!)?p:[...p,hit.id!]);if(hint===hit.id)setHint(null);setMessage('정답 영역 확인!')}else if(hit.kind==='wrong'){setWrong(n=>n+1);setMessage('영역 밖을 눌렀어요.')}else if(hit.kind==='duplicate')setMessage('이미 확인한 정답이에요.')}}/></div>)}</section>
  <footer className="play-footer"><p className="play-status" role="status">{clear?'모든 테스트 정답을 찾았어요.':message}</p><div className="play-actions"><div className="answer-progress" role="progressbar" aria-label="테스트 정답" aria-valuemin={0} aria-valuemax={answers.length} aria-valuenow={found.length}><div className="progress-dots" aria-hidden="true">{answers.map(a=><span key={a.id} className={found.includes(a.id)?'found':''}/>)}</div><strong>{found.length}/{answers.length}</strong></div><button className="tool-button hint-button" disabled={used||clear||!ready.every(Boolean)} onClick={()=>{const next=answers.find(a=>!found.includes(a.id));if(!next)return;setView(v=>{const z=Math.max(1,Math.min(v.z,.65/(Math.max(next.r,.035)*2)));return clampView({z,x:.5-next.x*z,y:.5-next.y*z})});setHint(next.id);setUsed(true);timer.current=setTimeout(()=>setHint(null),3000)}}><span aria-hidden="true">☀</span>테스트 힌트</button></div>{clear&&<p className="studio-test-score">{result.score}점 · {'★'.repeat(result.stars)} · 실제 기록과 보상은 바뀌지 않아요.</p>}</footer>
 </dialog>;
}
