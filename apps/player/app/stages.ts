import {answers} from "../../../packages/game-engine/index.mjs";
import type {Answer} from "../../../packages/game-engine/index.mjs";
export type Stage={id:string;title:string;difficulty:string;limit:number;chapter?:string;requiredStars?:number;images:[string,string];answers:(Answer&{difficulty?:string})[]};
export const stages:Stage[]=[{id:"sample-001",title:"개발용 오두막",difficulty:"쉬움",limit:120,images:["/samples/original.svg","/samples/modified.svg"],answers:answers.map((a,i)=>({...a,difficulty:i===4?"normal":"easy"}))}];
