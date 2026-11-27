"use client";
import {useEffect,useRef,useState} from "react";
import type {PointerEvent as PE} from "react";
import {clampView,zoomView,imagePoint} from "../../../packages/game-engine/index.mjs";
import type {View,Answer} from "../../../packages/game-engine/index.mjs";
type Props={source:string;answers:Answer[];side:number;view:View;setView:(v:View)=>void;found:number[];hint:number|null;onHit:(x:number,y:number,side:number)=>void;onReady:(side:number,ok:boolean)=>void};
export default function PuzzleCanvas({source,answers,side,view,setView,found,hint,onHit,onReady}:Props){
 const ref=useRef<HTMLCanvasElement>(null),img=useRef<HTMLImageElement|null>(null),current=useRef(view);
 const [cursor,setCursor]=useState<{x:number;y:number}|null>(null),[imageVersion,setImageVersion]=useState(0);
 const readyCallback=useRef(onReady);readyCallback.current=onReady;
 const pointers=useRef(new Map<number,{x:number;y:number}>()),moved=useRef(false),start=useRef({x:0,y:0});
 current.current=view;
 useEffect(()=>{const image=new Image();let active=true;image.onload=()=>{if(active){img.current=image;readyCallback.current(side,true);setImageVersion(v=>v+1)}};image.onerror=()=>{if(active)readyCallback.current(side,false)};image.src=source;return()=>{active=false;img.current=null}},[side,source]);
 function draw(){const c=ref.current;if(!c)return;const b=c.getBoundingClientRect(),d=window.devicePixelRatio||1;const size=Math.max(1,Math.round(b.width*d));if(c.width!==size||c.height!==size){c.width=size;c.height=size}const ctx=c.getContext("2d");if(!ctx)return;ctx.clearRect(0,0,size,size);if(!img.current)return;ctx.save();ctx.scale(size,size);ctx.translate(view.x,view.y);ctx.scale(view.z,view.z);ctx.drawImage(img.current,0,0,1,1);for(const a of answers){if(!found.includes(a.id)&&hint!==a.id)continue;ctx.beginPath();ctx.arc(a.x,a.y,a.r+(hint===a.id?.02:0),0,Math.PI*2);if(found.includes(a.id)){
 // Use CSS pixels so high-density mobile screens and zoom keep the ring visible.
 ctx.setLineDash([]);
 ctx.lineWidth=8/(b.width*view.z);ctx.strokeStyle="#16302a";ctx.stroke();
 ctx.lineWidth=5/(b.width*view.z);ctx.strokeStyle="#d9ff00";ctx.stroke();
 }else{
 ctx.lineWidth=2/(size*view.z);ctx.strokeStyle="#a16207";
 ctx.setLineDash([5/(size*view.z),3/(size*view.z)]);ctx.stroke();
 }}if(cursor){ctx.beginPath();const r=.014/view.z;ctx.moveTo(cursor.x-r,cursor.y);ctx.lineTo(cursor.x+r,cursor.y);ctx.moveTo(cursor.x,cursor.y-r);ctx.lineTo(cursor.x,cursor.y+r);ctx.setLineDash([]);ctx.lineWidth=4/(size*view.z);ctx.strokeStyle="white";ctx.stroke();ctx.lineWidth=2/(size*view.z);ctx.strokeStyle="black";ctx.stroke()}ctx.restore()}
 useEffect(()=>{draw();const c=ref.current;if(!c)return;const ro=new ResizeObserver(draw);ro.observe(c);return()=>ro.disconnect()},[view,found,hint,answers,cursor,imageVersion]);
 useEffect(()=>{const c=ref.current;if(!c)return;const wheel=(e:WheelEvent)=>{e.preventDefault();const b=c.getBoundingClientRect(),v=current.current;setView(zoomView(v,v.z*Math.exp(-e.deltaY*.002),(e.clientX-b.left)/b.width,(e.clientY-b.top)/b.height))};c.addEventListener("wheel",wheel,{passive:false});return()=>c.removeEventListener("wheel",wheel)},[setView]);
 function point(e:PE<HTMLCanvasElement>){const b=e.currentTarget.getBoundingClientRect();return {x:(e.clientX-b.left)/b.width,y:(e.clientY-b.top)/b.height}}
 function down(e:PE<HTMLCanvasElement>){if(e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);const p=point(e);if(!pointers.current.size){moved.current=false;start.current=p}else moved.current=true;pointers.current.set(e.pointerId,p)}
 function move(e:PE<HTMLCanvasElement>){const old=pointers.current.get(e.pointerId);if(!old)return;const p=point(e),v=current.current;const other=[...pointers.current.entries()].find(([id])=>id!==e.pointerId)?.[1];pointers.current.set(e.pointerId,p);
 if(other){moved.current=true;const d0=Math.hypot(old.x-other.x,old.y-other.y),d1=Math.hypot(p.x-other.x,p.y-other.y);if(d0>0){const mid={x:(old.x+other.x)/2,y:(old.y+other.y)/2};const z=zoomView(v,v.z*d1/d0,mid.x,mid.y);setView(clampView({...z,x:z.x+(p.x-old.x)/2,y:z.y+(p.y-old.y)/2}))}}
 else if(moved.current||Math.hypot(p.x-start.current.x,p.y-start.current.y)*e.currentTarget.clientWidth>6){const base=moved.current?old:start.current;moved.current=true;setView(clampView({...v,x:v.x+p.x-base.x,y:v.y+p.y-base.y}))}}
 function up(e:PE<HTMLCanvasElement>){if(!pointers.current.has(e.pointerId))return;const p=point(e);pointers.current.delete(e.pointerId);if(!moved.current&&!pointers.current.size){const q=imagePoint(current.current,p.x,p.y);onHit(q.x,q.y,side)}}
 return <canvas ref={ref} role="group" tabIndex={0} aria-describedby="puzzle-help" onFocus={()=>setCursor(imagePoint(current.current,.5,.5))} onBlur={()=>setCursor(null)} onKeyDown={e=>{const p=cursor??imagePoint(current.current,.5,.5);if(e.key==="Enter"||e.key===" "){e.preventDefault();onHit(p.x,p.y,side);return}const delta=({ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]} as Record<string,number[]>)[e.key];if(!delta)return;e.preventDefault();const step=(e.shiftKey?.002:.02)/view.z;setCursor({x:Math.max(Math.max(0,-view.x/view.z),Math.min(Math.min(1,(1-view.x)/view.z),p.x+delta[0]*step)),y:Math.max(Math.max(0,-view.y/view.z),Math.min(Math.min(1,(1-view.y)/view.z),p.y+delta[1]*step))})}} aria-label={side?"변형 그림":"원본 그림"} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={e=>{pointers.current.delete(e.pointerId);moved.current=true}} onLostPointerCapture={e=>{pointers.current.delete(e.pointerId)}}/>;
}
