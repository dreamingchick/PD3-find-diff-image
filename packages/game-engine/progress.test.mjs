import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyProgress,validateProgress,backup,restore,stageStars,totalStars,unlocked,resumeSession} from './progress.mjs';
const entry={score:3000,stars:2,elapsed:30,wrong:1,hints:0};
const record={first:entry,best:entry,recent:entry,maxStars:2};
const stages=[{id:'a',answers:[{id:1}]},{id:'b',answers:[{id:1}]},{id:'c',requiredStars:5,answers:[]}];
test('mode stars count once; sequence and star requirements both apply',()=>{
 const p=emptyProgress();assert.equal(unlocked(p.records,stages,'a'),true);assert.equal(unlocked(p.records,stages,'b'),false);
 p.records['a:normal']=record;p.records['a:challenge']={...record,maxStars:3};
 assert.equal(stageStars(p.records,'a'),3);assert.equal(totalStars(p.records,stages),3);assert.equal(unlocked(p.records,stages,'b'),true);assert.equal(unlocked(p.records,stages,'c'),false);
 p.records['b:normal']={...record,maxStars:1,first:{...entry,stars:1},best:{...entry,stars:1},recent:{...entry,stars:1}};
 assert.equal(unlocked(p.records,stages,'c'),false);p.records['b:normal']=record;assert.equal(unlocked(p.records,stages,'c'),true);assert.equal(unlocked(p.records,stages,'missing'),false);
});
test('backup round trip preserves records and unfinished normal sessions',()=>{
 const p={records:{'a:normal':record},sessions:{a:{found:[1],wrong:2,elapsed:12,used:true}}};
 const upgraded=validateProgress(p);assert.deepEqual(restore(backup(p)),upgraded);
 assert.deepEqual(restore(JSON.stringify({format:"pd3-progress",version:1,progress:p})),upgraded);
 assert.equal(upgraded.wallet.coins,100);assert.equal(upgraded.wallet.xp,60);assert.deepEqual(upgraded.wallet.claimed,["a"]);assert.equal(upgraded.sessions.a.hints,1);
 assert.deepEqual(resumeSession(p,{id:'a',answers:[{id:2}]}).found,[]);
});
test('reject corrupt, future, oversized and prototype-polluting backups',()=>{
 for(const text of ['{}','null','{"format":"pd3-progress","version":2}', 'x'.repeat(1000001)])assert.throws(()=>restore(text));
 for(const bad of [{...entry,stars:4},{...entry,elapsed:-1},{...entry,score:Infinity}])assert.throws(()=>backup({records:{'a:normal':{...record,best:bad}},sessions:{}}));
 assert.throws(()=>restore('{"format":"pd3-progress","version":1,"progress":{"records":{},"sessions":{"__proto__":{"found":[],"wrong":0,"elapsed":0,"used":false}}}}'));
 assert.throws(()=>backup({records:{},sessions:{a:{found:[1,1],wrong:0,elapsed:0,used:false}}}));
});
