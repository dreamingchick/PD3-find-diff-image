export const LEVELS=['easy','normal','hard'];
export const CHANGE_TYPES=['unclassified','add','remove','color','size','move','rotate','shape','detail','count'];
export const REQUIRED={easy:5,normal:6,hard:7};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v,max)=>typeof v==='string'&&v.length<=max;
export function parseDraft(v){
 if(!object(v)||!text(v.id,80)||!text(v.title,120)||!text(v.chapter??'',80)||!text(v.notes??'',2000)||!LEVELS.includes(v.difficulty)||!Number.isInteger(v.limit)||!Number.isInteger(v.resolution)||v.resolution<1||v.resolution>2048||!Array.isArray(v.regions)||v.regions.length>7)throw Error('초안 형식이 올바르지 않아요.');
 const seen=new Set(),regions=v.regions.map(r=>{
  if(!object(r)||!Number.isSafeInteger(r.id)||r.id<1||r.id>1000000||seen.has(r.id)||!Array.isArray(r.box)||r.box.length!==4||!r.box.every(Number.isSafeInteger)||!LEVELS.includes(r.difficulty)||!CHANGE_TYPES.includes(r.changeType))throw Error('정답 영역 형식이 올바르지 않아요.');
  seen.add(r.id);return {id:r.id,box:[...r.box],difficulty:r.difficulty,changeType:r.changeType};
 });
 return {id:v.id,title:v.title,chapter:v.chapter??'',notes:v.notes??'',difficulty:v.difficulty,limit:v.limit,resolution:v.resolution,regions};
}
export function validateDraft(value){
 let d;try{d=parseDraft(value)}catch(e){return {errors:[{code:'shape',message:e.message}],warnings:[]}}
 const errors=[],warnings=[],add=(code,message)=>errors.push({code,message});
 if(!/^[\w-]{1,80}$/.test(d.id)||['__proto__','constructor','prototype'].includes(d.id))add('id','그림 ID는 영문·숫자·밑줄·하이픈으로 입력해 주세요.');
 if(!d.title.trim())add('title','그림 제목을 입력해 주세요.');
 if(d.limit<10||d.limit>3600)add('limit','도전 시간은 10~3600초로 설정해 주세요.');
 if(d.resolution<256)add('resolution','이미지는 256~2048픽셀 정사각형이어야 해요.');
 if(d.regions.length!==REQUIRED[d.difficulty])add('count',`이 난이도에는 정답 ${REQUIRED[d.difficulty]}개가 필요해요. 현재 ${d.regions.length}개예요.`);
 for(const r of d.regions){const [x0,y0,x1,y1]=r.box;if(!(0<=x0&&x0<x1&&x1<=d.resolution&&0<=y0&&y0<y1&&y1<=d.resolution))add('bounds',`정답 ${r.id}: 영역이 그림 밖이거나 크기가 0이에요.`)}
 for(let i=0;i<d.regions.length;i++)for(let j=0;j<i;j++){
  const a=d.regions[i].box,b=d.regions[j].box;
  if(a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1])add('overlap',`정답 ${d.regions[j].id}와 ${d.regions[i].id} 사이에 여백을 두세요.`);
 }
 const types=new Map();for(const r of d.regions)types.set(r.changeType,(types.get(r.changeType)??0)+1);
 if(types.has('unclassified'))warnings.push({code:'unclassified',message:`변경 유형을 정하지 않은 정답이 ${types.get('unclassified')}개예요.`});
 for(const [type,count] of types)if(type!=='unclassified'&&count>2)warnings.push({code:'type-count',message:'같은 변경 유형은 한 그림에서 최대 2개로 조정해 주세요.'});
 return {errors,warnings};
}
export function answersFromDraft(value){
 const d=parseDraft(value);if(validateDraft(d).errors.length)throw Error('정답 영역을 먼저 확인해 주세요.');
 return d.regions.map(r=>{const [x0,y0,x1,y1]=r.box,n=d.resolution,b={shape:'rect',x:x0/n,y:y0/n,w:(x1-x0)/n,h:(y1-y0)/n};return {id:r.id,x:(x0+x1)/(2*n),y:(y0+y1)/(2*n),r:Math.max(x1-x0,y1-y0)/(2*n),difficulty:r.difficulty,hitboxes:[{...b},{...b}]}});
}
export function scanPixels(a,b,width,height,regions,start=0,end=width*height,mask=null){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>2048||height>2048||a.length!==width*height*4||b.length!==a.length||!Number.isInteger(start)||!Number.isInteger(end)||start<0||start>end||end>width*height)throw Error('이미지 픽셀 크기가 맞지 않아요.');
 if(mask&&mask.length!==a.length)throw Error('차이 표시 크기 오류');
 const regionChanged=regions.map(()=>0);let outsideChanged=0,totalChanged=0,transparent=0;
 for(let p=start;p<end;p++){
  const i=p*4;if(mask)mask[i+3]=0;if(a[i+3]!==255||b[i+3]!==255)transparent++;
  if(a[i]===b[i]&&a[i+1]===b[i+1]&&a[i+2]===b[i+2]&&a[i+3]===b[i+3])continue;
  totalChanged++;const x=p%width,y=Math.floor(p/width);let inside=false;
  for(let j=0;j<regions.length;j++){const q=regions[j].box;if(x>=q[0]&&x<q[2]&&y>=q[1]&&y<q[3]){regionChanged[j]++;inside=true}}
  if(!inside)outsideChanged++;
  if(mask){mask[i]=255;mask[i+1]=inside?40:30;mask[i+2]=inside?200:30;mask[i+3]=inside?190:230;}
 }
 return {outsideChanged,totalChanged,transparent,regionChanged};
}
export function pixelReport(scan){return {...scan,passed:scan.outsideChanged===0&&scan.transparent===0&&scan.regionChanged.length>0&&scan.regionChanged.every(n=>n>0)};}
export function parsePackage(source){
 if(typeof source!=='string'||source.length>50*1024*1024)throw Error('초안 파일이 너무 커요.');
 const v=JSON.parse(source);
 if(!object(v)||v.format!=='pd3-studio-draft'||v.version!==1||v.visibility!=='private'||!Array.isArray(v.images)||v.images.length!==2)throw Error('PD3 Studio 비공개 초안 파일이 아니에요.');
 const draft=parseDraft(v.draft);if(validateDraft(draft).errors.length)throw Error('초안의 제목·난이도·정답 영역을 확인해 주세요.');
 const images=v.images.map(im=>{
  if(!object(im)||!text(im.name,160)||typeof im.data!=='string'||im.data.length>24*1024*1024||!/^data:image\/(png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(im.data)||typeof im.sha256!=='string'||!/^[a-f0-9]{64}$/.test(im.sha256))throw Error('이미지 파일 정보가 올바르지 않아요.');
  return {name:im.name,data:im.data,sha256:im.sha256};
 });
 // Imported validation/review flags are deliberately not trusted.
 return {draft,images};
}

// Field order is shared with the independent private review worker. No QA flags
// or timestamps are included: identical content always identifies one revision.
export function canonicalContent(draft,images){
 const d=parseDraft(draft);
 if(!Array.isArray(images)||images.length!==2||images.some(i=>!object(i)||!text(i.name,160)||typeof i.sha256!=='string'||!/^[a-f0-9]{64}$/.test(i.sha256)))throw Error('이미지 검증 정보가 필요해요.');
 return JSON.stringify({draft:d,images:images.map(i=>({name:i.name,sha256:i.sha256}))});
}
export function reviewReadiness(draft,report,played,reviewed){
 const {errors,warnings}=validateDraft(draft),reasons=[...errors,...warnings].map(i=>i.message);
 if(!report||!pixelReport(report).passed)reasons.push('현재 초안의 픽셀 검사를 통과해 주세요.');
 if(!played)reasons.push('플레이 테스트에서 모든 정답을 확인해 주세요.');
 if(!reviewed)reasons.push('그림과 변경 유형을 직접 확인해 주세요.');
 return reasons;
}
