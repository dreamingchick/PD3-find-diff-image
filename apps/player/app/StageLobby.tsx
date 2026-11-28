"use client";
import {useState} from "react";
import {stageStars,totalStars,unlocked} from "../../../packages/game-engine/progress.mjs";
import {stages} from "./stages";
import BackupControls from "./BackupControls";
import GrowthPanel from "./GrowthPanel";
import type {Progress} from "./storage";

type Props={progress:Progress;hydrated:boolean;storageError:boolean;mode:string;onMode:(mode:string)=>void;onStart:(id:string,mode:string)=>void;onRestore:(p:Progress)=>Promise<void>;onProgress:(p:Progress)=>void};
export default function StageLobby({progress,hydrated,storageError,mode,onMode,onStart,onRestore,onProgress}:Props){
 const [tab,setTab]=useState("main"),[filter,setFilter]=useState("all");
 const stars=totalStars(progress.records,stages),won=stages.filter(s=>stageStars(progress.records,s.id)>0).length;
 const visible=stages.filter(s=>filter==="all"||(filter==="won"?stageStars(progress.records,s.id)>0:stageStars(progress.records,s.id)===0));
 const resume=stages.find(s=>unlocked(progress.records,stages,s.id)&&progress.sessions[s.id]?.found.length);
 const next=resume??stages.find(s=>unlocked(progress.records,stages,s.id)&&stageStars(progress.records,s.id)===0)??stages[0];
 return <main className="lobby">
  <header className="lobby-header"><a className="brand" href="#" onClick={e=>{e.preventDefault();setTab("main")}}>PD3<span>그림 속 작은 발견</span></a><span className="star-total" aria-label={`누적 별 ${stars} / ${stages.length*3}`}>★ {stars}<small> / {stages.length*3}</small></span><button className="icon-button" aria-label="설정 열기" onClick={()=>setTab("settings")}>⚙</button></header>
  <GrowthPanel progress={progress} onChange={onProgress} disabled={!hydrated}/>
  {tab==="main"&&<>
   <section className="lobby-hero" aria-label="그림 속 작은 발견"><img src={stages[0].images[0]} alt=""/><div><span className="eyebrow">A LITTLE MOMENT OF DISCOVERY</span><h1>천천히 보고,<br/>작은 차이를 발견해요.</h1><p>나만의 속도로 즐기는 틀린그림찾기</p><button disabled={!hydrated} onClick={()=>onStart(next.id,mode)}>{resume&&mode==="normal"?"이어서 찾기":"그림 찾기 시작"} <span aria-hidden="true">↗</span></button></div></section>
   <section className="stage-section" aria-label="스테이지 목록">
    <div className="section-heading"><div><span className="eyebrow">YOUR NEXT DISCOVERY</span><h2>어떤 그림을 만나볼까요?</h2></div><span>{stages.length}개의 그림</span></div>
    <div className="lobby-options"><div className="segmented" aria-label="플레이 모드"><button aria-pressed={mode==="normal"} onClick={()=>onMode("normal")}>일반</button><button aria-pressed={mode==="challenge"} onClick={()=>onMode("challenge")}>도전</button></div><p>{mode==="normal"?"시간에 쫓기지 않고, 편안하게":"시간 안에 찾기 · 오답은 5초 차감"}</p></div>
    <div className="stage-filters" aria-label="스테이지 필터">{[["all",`전체 (${stages.length})`],["open",`미해결 (${stages.length-won})`],["won",`완료 (${won})`]].map(([value,label])=><button key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}</button>)}</div>
    <div className="stage-grid">{visible.map(s=>{const index=stages.indexOf(s)+1,earned=stageStars(progress.records,s.id),open=unlocked(progress.records,stages,s.id);return <button key={s.id} className={`stage-card${open?"":" locked"}`} aria-label={`스테이지 ${index} · ${s.title}${open?"":" · 잠김"}`} disabled={!hydrated||!open} onClick={()=>onStart(s.id,mode)}><span className="stage-art"><img src={s.images[0]} alt="" loading="lazy"/><span className="stage-number">{open?String(index).padStart(2,"0"):"🔒"}</span>{earned>0&&<span className="completed-badge" aria-label="완료">✓</span>}</span><span className="stage-title">{s.title.replace(" (검수용)","")}</span><span className="stage-meta">{s.difficulty}<span aria-label={`${earned}성`}>{"★".repeat(earned)}{"☆".repeat(3-earned)}</span></span>{!open&&<span className="lock-reason">이전 그림을 완성하면 열려요</span>}</button>})}</div>
    {visible.length===0&&<p className="empty-state">{filter==="won"?"첫 그림을 완성하고 별을 모아 보세요.":"모든 그림을 완성했어요. 다시 도전해 볼까요?"}</p>}
   </section>
   <p className="qa-note">앞 그림을 완성하면 다음 이야기가 열려요.</p>
  </>}
  {tab==="records"&&<section className="lobby-panel"><span className="eyebrow">YOUR DISCOVERIES</span><h1>나의 발견 기록</h1><p>그림 {won} / {stages.length}개 완성 · 누적 별 {stars}개</p><div className="record-list">{stages.map(s=><article key={s.id}><img src={s.images[0]} alt=""/><div><h2>{s.title}</h2>{["normal","challenge"].map(m=>{const r=progress.records[s.id+":"+m];return <p key={m}>{m==="normal"?"일반":"도전"} · {r?`${r.best.score.toLocaleString()}점 · ${r.maxStars}성`:"아직 기록이 없어요"}</p>})}</div></article>)}</div></section>}
  {tab==="settings"&&<section className="lobby-panel"><span className="eyebrow">YOUR SPACE</span><h1>설정과 진행 보관</h1><p>그림을 터치해 정답을 찾으세요. 두 손가락 또는 휠로 바로 확대하고, 확대한 그림을 끌어 이동할 수 있어요.</p><a className="studio-entry" href="/studio">콘텐츠 스튜디오 열기 <span aria-hidden="true">↗</span></a><BackupControls progress={progress} onRestore={onRestore} disabled={!hydrated}/></section>}
  {!hydrated&&<p role="status">진행을 불러오는 중이에요.</p>}{storageError&&<p role="alert">브라우저 저장을 사용할 수 없습니다. 기록이 보존되지 않을 수 있습니다.</p>}
  <nav className="lobby-nav" aria-label="메인 메뉴">{[["main","▦","메인"],["records","☆","내 기록"],["settings","⚙","설정"]].map(([value,icon,label])=><button key={value} aria-current={tab===value?"page":undefined} onClick={()=>{setTab(value);window.scrollTo({top:0})}}><span aria-hidden="true">{icon}</span>{label}</button>)}</nav>
 </main>;
}
