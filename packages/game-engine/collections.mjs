// Local practice achievements, derived from retained records. No reward claims.
const goals=[
 {id:'first-discovery',title:'첫 발견',description:'서로 다른 그림 1개 완성',metric:'completed',target:1,symbol:'✦'},
 {id:'little-walk',title:'작은 산책',description:'서로 다른 그림 3개 완성',metric:'completed',target:3,symbol:'❧'},
 {id:'picture-collector',title:'그림 수집가',description:'서로 다른 그림 10개 완성',metric:'completed',target:10,symbol:'◈'},
 {id:'bright-eyes',title:'반짝이는 눈',description:'그림 1개에서 별 3개 달성',metric:'perfect',target:1,symbol:'✧'},
 {id:'careful-explorer',title:'꼼꼼한 탐험가',description:'서로 다른 그림 3개에서 별 3개 달성',metric:'perfect',target:3,symbol:'❋'},
 {id:'first-challenge',title:'도전의 시작',description:'도전 모드에서 그림 1개 완성',metric:'challenge',target:1,symbol:'⚑'},
 {id:'starlight-collector',title:'별빛 수집가',description:'그림별 최고 별을 합해 30개 달성',metric:'stars',target:30,symbol:'✺'},
];
export function discoveryCollection(records){
 const pictures=new Map(),challenges=new Set();
 for(const [key,record] of Object.entries(records??{})){
  const match=/^([A-Za-z0-9_-]{1,80}):(normal|challenge)$/.exec(key),stars=record?.maxStars;
  if(!match||['__proto__','constructor','prototype'].includes(match[1])||!Number.isInteger(stars)||stars<1||stars>3)continue;
  pictures.set(match[1],Math.max(pictures.get(match[1])??0,stars));
  if(match[2]==='challenge')challenges.add(match[1]);
 }
 const values=[...pictures.values()],stats={completed:pictures.size,perfect:values.filter(n=>n===3).length,challenge:challenges.size,stars:values.reduce((sum,n)=>sum+n,0)};
 const badges=goals.map(goal=>({...goal,progress:Math.min(goal.target,stats[goal.metric]),earned:stats[goal.metric]>=goal.target}));
 return {stats,badges,earned:badges.filter(b=>b.earned).length,total:badges.length};
}
