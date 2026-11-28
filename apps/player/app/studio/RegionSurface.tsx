"use client";
import {useRef,useState} from 'react';
import type {PointerEvent} from 'react';
import type {Region} from '../../../../packages/studio-core/index.mjs';
type Box=[number,number,number,number];
export default function RegionSurface({source,size,regions,selected,drawing,heatmap,side,onSelect,onDraw}:{source:string;size:number;regions:Region[];selected:number|null;drawing:boolean;heatmap:string|null;side:number;onSelect:(id:number)=>void;onDraw:(box:Box)=>void}){
 const ref=useRef<SVGSVGElement>(null),start=useRef<[number,number]|null>(null),[scratch,setScratch]=useState<Box|null>(null);
 function point(e:PointerEvent<SVGSVGElement>):[number,number]{const b=e.currentTarget.getBoundingClientRect();return [Math.round(Math.max(0,Math.min(size,(e.clientX-b.left)/b.width*size))),Math.round(Math.max(0,Math.min(size,(e.clientY-b.top)/b.height*size)))]}
 function box(a:[number,number],b:[number,number]):Box{return [Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])]}
 return <figure className="studio-picture"><figcaption>{side?'변형 그림':'원본 그림'}</figcaption><svg ref={ref} role="img" aria-label={side?'변형 영역 편집':'원본 영역 편집'} viewBox={`0 0 ${size} ${size}`} className={drawing?'drawing':''}
  onPointerDown={e=>{if(drawing&&e.button===0){e.currentTarget.setPointerCapture(e.pointerId);start.current=point(e);setScratch(box(start.current,start.current))}}}
  onPointerMove={e=>{if(start.current)setScratch(box(start.current,point(e)))}}
  onPointerUp={e=>{const p=point(e);if(start.current){const next=box(start.current,p);start.current=null;setScratch(null);if(next[2]-next[0]>=2&&next[3]-next[1]>=2)onDraw(next)}else if(!drawing){const r=regions.find(r=>p[0]>=r.box[0]&&p[0]<r.box[2]&&p[1]>=r.box[1]&&p[1]<r.box[3]);if(r)onSelect(r.id)}}}
  onPointerCancel={()=>{start.current=null;setScratch(null)}}>
  <image href={source} width={size} height={size} pointerEvents="none"/>{heatmap&&<image href={heatmap} width={size} height={size} opacity=".8" pointerEvents="none"/>}
  {regions.map(r=>r.box[2]>r.box[0]&&r.box[3]>r.box[1]&&<g key={r.id} pointerEvents="none"><rect x={r.box[0]} y={r.box[1]} width={r.box[2]-r.box[0]} height={r.box[3]-r.box[1]} fill={selected===r.id?'#d9ff002b':'#16c8bb22'} stroke={selected===r.id?'#d9ff00':'#00cbbb'} strokeWidth="2" vectorEffect="non-scaling-stroke"/><text x={r.box[0]+size*.008} y={r.box[1]+size*.033} fontSize={size*.03} fill="white" stroke="#12251d" strokeWidth={size*.004} paintOrder="stroke">{r.id}</text></g>)}
  {scratch&&<rect x={scratch[0]} y={scratch[1]} width={scratch[2]-scratch[0]} height={scratch[3]-scratch[1]} fill="#d9ff0033" stroke="#d9ff00" strokeWidth="2" strokeDasharray="5 3" vectorEffect="non-scaling-stroke" pointerEvents="none"/>}
 </svg></figure>;
}
