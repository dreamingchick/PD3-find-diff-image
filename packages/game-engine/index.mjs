export const answers=[{id:1,x:.50,y:.32,r:.13},{id:2,x:.83,y:.14,r:.08},{id:3,x:.63,y:.55,r:.065},{id:4,x:.17,y:.62,r:.08},{id:5,x:.83,y:.84,r:.08}];
export function contains(x,y,b){
 if(b.shape==="rect")return x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h;
 if(b.shape==="polygon"){
 const p=b.points;let inside=false;
 for(let i=0,j=p.length-1;i<p.length;j=i++){
 const [ax,ay]=p[j],[bx,by]=p[i],dx=bx-ax,dy=by-ay;
 const cross=(x-ax)*dy-(y-ay)*dx;
 if(Math.abs(cross)<1e-10&&x>=Math.min(ax,bx)-1e-10&&x<=Math.max(ax,bx)+1e-10&&y>=Math.min(ay,by)-1e-10&&y<=Math.max(ay,by)+1e-10)return true;
 if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
 }return inside;
 }
 return Math.hypot(x-b.x,y-b.y)<=b.r;
}
export function judge(x,y,found,regions=answers,side=0){
 if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1)return {kind:"invalid"};
 const matches=regions.filter(a=>contains(x,y,a.hitboxes?.[side]??a));
 if(matches.length>1)return {kind:"invalid"};
 const a=matches[0];return a?{kind:found.includes(a.id)?"duplicate":"correct",id:a.id}:{kind:"wrong"};
}
export function clampView(v){const z=Math.max(1,Math.min(4,v.z));return {z,x:Math.max(1-z,Math.min(0,v.x)),y:Math.max(1-z,Math.min(0,v.y))};}
export function zoomView(v,z,x=.5,y=.5){z=Math.max(1,Math.min(4,z));return clampView({z,x:x-(x-v.x)*z/v.z,y:y-(y-v.y)*z/v.z});}
export function imagePoint(v,x,y){return {x:(x-v.x)/v.z,y:(y-v.y)/v.z};}
