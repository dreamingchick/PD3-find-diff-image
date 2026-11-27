"use client";
import {useState} from "react";
import {backup,restore} from "../../../packages/game-engine/progress.mjs";
import type {Progress} from "./storage";
export default function BackupControls({progress,onRestore,disabled}:{progress:Progress;onRestore:(p:Progress)=>void;disabled:boolean}){
 const [status,setStatus]=useState("");
 return <section aria-label="진행 백업"><p>진행은 이 브라우저에 저장됩니다. 복원 파일을 선택하면 현재 기록을 대체합니다. 로컬 기록은 공식 랭킹에 사용되지 않습니다.</p><div className="controls"><button disabled={disabled} onClick={()=>{
  const url=URL.createObjectURL(new Blob([backup(progress)],{type:"application/json"}));
  const a=document.createElement("a");a.href=url;a.download="pd3-progress.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setStatus("진행 백업을 내보냈습니다.");
 }}>백업 다운로드</button><label>백업 복원 <input type="file" accept="application/json,.json" disabled={disabled} onChange={async e=>{
  const file=e.target.files?.[0];e.target.value="";if(!file)return;
  try{if(file.size>1000000)throw Error();const p=restore(await file.text());onRestore(p);setStatus("진행을 복원했습니다.")}catch{setStatus("유효한 PD3 백업 파일이 아닙니다. 현재 기록은 유지됩니다.")}
 }}/></label></div><p role="status">{status}</p></section>;
}
