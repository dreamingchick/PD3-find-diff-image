"use client";
import {useState} from "react";
import {BALANCE,levelProgress} from "../../../packages/game-engine/economy.mjs";
import {buyHint} from "./storage";
import type {Progress} from "./storage";
export default function GrowthPanel({progress,onChange,disabled}:{progress:Progress;onChange:(p:Progress)=>void;disabled:boolean}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const {wallet}=progress,level=levelProgress(wallet.xp);
 async function exchange(){if(busy)return;setBusy(true);try{const result=await buyHint();onChange(result.progress);setMessage(result.value?"보유 힌트가 1개 늘었어요.":"코인이 부족해요.")}catch{setMessage("저장하지 못했어요. 코인과 힌트는 바뀌지 않았어요.")}finally{setBusy(false)}}
 return <section className="growth-panel" aria-label="성장과 보상"><div className="level-line"><strong>Lv. {level.level}</strong><div className="xp-track" role="progressbar" aria-label="레벨 경험치" aria-valuemin={0} aria-valuemax={level.required} aria-valuenow={level.current}><span style={{width:`${level.current/level.required*100}%`}}/></div><span aria-label="현재 경험치">{level.current} / {level.required} EXP</span></div><div className="wallet-line"><span aria-label={`보유 코인 ${wallet.coins}`}><span aria-hidden="true">◉</span> {wallet.coins.toLocaleString()}</span><span aria-label={`보유 힌트 ${wallet.hints}`}><span aria-hidden="true">☀</span> {wallet.hints}</span><button disabled={disabled||busy||wallet.coins<BALANCE.hintCost} onClick={exchange}>힌트 교환 · {BALANCE.hintCost}코인</button></div>{message&&<p role="status">{message}</p>}</section>;
}
