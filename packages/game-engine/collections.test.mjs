import {test} from 'node:test';
import assert from 'node:assert/strict';
import {discoveryCollection} from './collections.mjs';
import {emptyProgress,backup,restore} from './progress.mjs';
import {record} from './rewards.mjs';
const entry={score:4500,stars:3,elapsed:20,wrong:0,hints:0};
const completed=(stars=3)=>record(undefined,{...entry,stars});
test('new players have empty collection and fixed reachable goals without mutating records or wallet',()=>{
 const p=emptyProgress(),before=structuredClone(p),c=discoveryCollection(p.records);
 assert.equal(c.earned,0);assert.equal(c.total,7);assert.ok(c.badges.every(b=>b.progress===0&&!b.earned));assert.deepEqual(p,before);
});
test('normal and challenge share picture and star counts while challenge has its own goal',()=>{
 const c=discoveryCollection({'a:normal':completed(2),'a:challenge':completed(3),'b:normal':completed(1)});
 assert.deepEqual(c.stats,{completed:2,perfect:1,challenge:1,stars:4});assert.equal(c.earned,3);
 assert.ok(c.badges.find(b=>b.id==='first-challenge').earned);
});
test('a poorer replay cannot revoke a max-star achievement and old catalog pictures still count',()=>{
 const records={'retired-picture:normal':record(completed(3),{...entry,score:100,stars:1,hints:2})};
 assert.equal(discoveryCollection(records).stats.perfect,1);assert.ok(discoveryCollection(records).badges.find(b=>b.id==='bright-eyes').earned);
});
test('thresholds cap visible progress and backups derive exactly the selected snapshot without extra grants',()=>{
 const p=emptyProgress();for(let i=0;i<12;i++)p.records[`p${i}:challenge`]=completed();
 p.wallet={coins:1200,xp:720,hints:0,claimed:Array.from({length:12},(_,i)=>'p'+i)};
 const c=discoveryCollection(p.records);assert.equal(c.earned,7);assert.ok(c.badges.every(b=>b.progress===b.target));
 const restored=restore(backup(p));assert.deepEqual(discoveryCollection(restored.records),c);assert.deepEqual(restored.wallet,p.wallet);assert.equal(discoveryCollection(emptyProgress().records).earned,0);
});
test('unfinished zero-star invalid-mode reserved-key and malformed counts never earn badges',()=>{
 const records={'unfinished:normal':completed(0),'wrong:ranked':completed(3),'__proto__:normal':completed(3),'a:normal':{maxStars:4},'b:normal':{maxStars:NaN},'c:challenge':{maxStars:1.5}};
 assert.equal(discoveryCollection(records).earned,0);assert.deepEqual(discoveryCollection(records).stats,{completed:0,perfect:0,challenge:0,stars:0});
});
