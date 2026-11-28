import {parseDraft,parsePackage,canonicalContent,validateDraft} from './index.mjs';
export const BUCKET='pd3-review-images';
export function adminConfig(v){
 if(!v||typeof v!=='object'||typeof v.url!=='string'||!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(v.url)||typeof v.publishableKey!=='string'||!/^sb_publishable_[A-Za-z0-9_-]{10,200}$/.test(v.publishableKey))throw Error('관리자 서버 연결 설정을 확인해 주세요.');
 return {url:v.url,publishableKey:v.publishableKey};
}
export function reviewProof(v,digest){
 if(!v||typeof v!=='object'||v.version!==1||v.contentDigest!==digest||!/^[a-f0-9]{64}$/.test(digest)||v.testPlayCleared!==true||v.semanticReviewConfirmed!==true||typeof v.requestedAt!=='string'||v.requestedAt.length>40||!Number.isFinite(Date.parse(v.requestedAt)))throw Error('검수 요청 파일을 다시 만들어 주세요.');
 return {version:1,contentDigest:digest,requestedAt:v.requestedAt,testPlayCleared:true,semanticReviewConfirmed:true};
}
export function submission(source){
 const parsed=parsePackage(source),raw=JSON.parse(source),proof=reviewProof(raw.reviewRequest,raw.reviewRequest?.contentDigest);
 if(validateDraft(parsed.draft).warnings.length)throw Error('변경 유형을 모두 확인한 검수 요청이 필요해요.');
 return {...parsed,proof,canonical:canonicalContent(parsed.draft,parsed.images)};
}
export function metadata(row){
 const draft=parseDraft(row.draft);
 if(!Array.isArray(row.images)||row.images.length!==2||typeof row.digest!=='string'||!/^[a-f0-9]{64}$/.test(row.digest))throw Error('검수 파일 정보가 올바르지 않아요.');
 const images=row.images.map((im,i)=>{
  if(!im||typeof im.name!=='string'||im.name.length>160||typeof im.sha256!=='string'||!/^[a-f0-9]{64}$/.test(im.sha256)||!['image/png','image/webp'].includes(im.mime)||im.path!==row.digest+'/'+i+'.'+(im.mime==='image/png'?'png':'webp'))throw Error('비공개 이미지 정보를 확인해 주세요.');
  return {name:im.name,sha256:im.sha256,mime:im.mime,path:im.path};
 });
 if(canonicalContent(draft,images)!==row.canonical)throw Error('검수 버전 정보가 바뀌었어요.');
 return {draft,images,proof:reviewProof(row.review_request,row.digest)};
}
export const one=value=>Array.isArray(value)?value[0]??null:value??null;
export function status(row){const decision=one(row.pd3_review_decisions),check=one(row.pd3_review_validations);return decision?(decision.decision==='approved'?'승인 완료':'반려'):!row.upload_complete?'업로드 미완료':!check?'서버 검사 대기':check.passed?'승인 대기':'수정 필요';}
