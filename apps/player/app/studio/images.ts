import type {StoredImage} from './drafts';
export type LoadedImage=StoredImage&{url:string;pixels:ImageData;width:number;height:number};
const MAX_BYTES=16*1024*1024;
export async function decodeImage(blob:Blob,name:string):Promise<LoadedImage>{
 if(!blob.size||blob.size>MAX_BYTES)throw Error('이미지는 한 장에 16MB까지 사용할 수 있어요.');
 const raw=await blob.arrayBuffer(),head=new Uint8Array(raw,0,Math.min(raw.byteLength,12));
 const png=[137,80,78,71,13,10,26,10].every((v,i)=>head[i]===v),webp=String.fromCharCode(...head.slice(0,4))==='RIFF'&&String.fromCharCode(...head.slice(8,12))==='WEBP';
 if(!png&&!webp)throw Error('PNG 또는 WebP 이미지를 선택해 주세요.');
 const safe=new Blob([raw],{type:png?'image/png':'image/webp'}),url=URL.createObjectURL(safe);
 try{
  const image=new Image();image.src=url;await image.decode();const width=image.naturalWidth,height=image.naturalHeight;
  if(width!==height||width<256||width>2048)throw Error('256~2048픽셀 크기의 정사각형 이미지가 필요해요.');
  const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('이 브라우저에서 이미지 검사를 사용할 수 없어요.');ctx.drawImage(image,0,0);
  const hash=await crypto.subtle.digest('SHA-256',raw),sha256=[...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');
  return {name:name.slice(0,160),blob:safe,sha256,url,pixels:ctx.getImageData(0,0,width,height),width,height};
 }catch(error){URL.revokeObjectURL(url);throw error}
}
export async function fromCatalog(url:string,name:string){
 const address=new URL(url,location.origin);if(address.origin!==location.origin||!['/qa/','/samples/'].some(p=>address.pathname.startsWith(p)))throw Error('이 그림은 제작 도구에서 열 수 없어요.');
 const response=await fetch(address,{credentials:'same-origin'});if(!response.ok)throw Error('그림을 불러오지 못했어요.');let blob=await response.blob();
 if(address.pathname.startsWith('/samples/')&&address.pathname.endsWith('.svg')){
  const local=URL.createObjectURL(blob);try{const image=new Image();image.src=local;await image.decode();const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;c.getContext('2d')!.drawImage(image,0,0);blob=await new Promise<Blob>((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('샘플 변환 실패')),'image/png'))}finally{URL.revokeObjectURL(local)}
 }
 return decodeImage(blob,name);
}
export function dataUrl(blob:Blob):Promise<string>{return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(r.error);r.readAsDataURL(blob)})}
export async function fromDataUrl(data:string,name:string,expected:string){const match=/^data:image\/(png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);if(!match)throw Error('이미지 형식 오류');const raw=atob(match[2]);if(raw.length>MAX_BYTES)throw Error('이미지가 너무 커요.');const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);const image=await decodeImage(new Blob([bytes],{type:'image/'+match[1]}),name);if(image.sha256!==expected){URL.revokeObjectURL(image.url);throw Error('이미지 검증 값이 맞지 않아요.')}return image;}
