import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BALANCE,initialWallet,awardFirstClear,exchangeHint,spendStockHint,levelProgress} from './economy.mjs';
import {emptyProgress,validateProgress,backup,restore} from './progress.mjs';
const entry={score:3000,stars:3,elapsed:30,wrong:0,hints:0};
const record={first:entry,best:entry,recent:entry,maxStars:3};

test('first-clear grants are immutable and stage-idempotent across retries/modes',()=>{
 const initial=initialWallet();Object.freeze(initial.claimed);Object.freeze(initial);
 const one=awardFirstClear(initial,'stage-a'),again=awardFirstClear(one.wallet,'stage-a');
 assert.equal(one.wallet.coins,BALANCE.firstClearCoins);assert.equal(one.wallet.xp,BALANCE.firstClearXp);
 assert.equal(again.grant.first,false);assert.deepEqual(again.wallet,one.wallet);assert.equal(initial.coins,0);
 const two=awardFirstClear(again.wallet,'stage-b');assert.equal(two.wallet.coins,2*BALANCE.firstClearCoins);assert.deepEqual(two.wallet.claimed,['stage-a','stage-b']);
 assert.throws(()=>awardFirstClear(two.wallet,'__proto__'));
});
test('hint exchange and stock spend cannot create negative balances',()=>{
 let wallet=awardFirstClear(initialWallet(),'stage-a').wallet;
 const count=Math.floor(wallet.coins/BALANCE.hintCost);
 for(let i=0;i<count;i++){const next=exchangeHint(wallet);assert.equal(next.ok,true);wallet=next.wallet}
 assert.equal(wallet.hints,count);const denied=exchangeHint(wallet);assert.equal(denied.ok,false);assert.deepEqual(denied.wallet,wallet);
 for(let i=0;i<count;i++)wallet=spendStockHint(wallet).wallet;
 assert.equal(wallet.hints,0);assert.equal(spendStockHint(wallet).ok,false);
});
test('levels derive from total XP at exact boundaries',()=>{
 assert.deepEqual(levelProgress(0),{level:1,current:0,required:BALANCE.xpPerLevel});
 assert.equal(levelProgress(BALANCE.xpPerLevel-1).level,1);
 assert.deepEqual(levelProgress(BALANCE.xpPerLevel),{level:2,current:0,required:BALANCE.xpPerLevel});
 assert.equal(levelProgress(3*BALANCE.xpPerLevel+7).level,4);assert.equal(levelProgress(3*BALANCE.xpPerLevel+7).current,7);
});
test('legacy completion rewards migrate once per stage, never once per mode',()=>{
 const old={records:{'a:normal':record,'a:challenge':record,'b:normal':record},sessions:{}};
 const next=validateProgress(old);assert.equal(next.version,2);assert.equal(next.wallet.coins,2*BALANCE.firstClearCoins);assert.deepEqual(next.wallet.claimed,['a','b']);
 assert.deepEqual(validateProgress(next),next);assert.deepEqual(restore(backup(next)),next);
 assert.equal(awardFirstClear(next.wallet,'a').grant.first,false);
});
test('v2 rejects inconsistent claims and corrupted resource/session values',()=>{
 const valid=validateProgress({records:{'a:normal':record},sessions:{}});
 for(const field of ['coins','xp','hints'])for(const value of [-1,1.5,Infinity])assert.throws(()=>validateProgress({...valid,wallet:{...valid.wallet,[field]:value}}));
 for(const claimed of [[],['a','a'],['b']])assert.throws(()=>validateProgress({...valid,wallet:{...valid.wallet,claimed}}));
 const p=emptyProgress();assert.throws(()=>validateProgress({...p,sessions:{a:{found:[],used:true,hints:0,elapsed:0,wrong:0,attemptId:'one'}}}));
 assert.throws(()=>restore(JSON.stringify({format:'pd3-progress',version:3,progress:p})));
});
test('overflow aborts wallet arithmetic without changing the original',()=>{
 const wallet={...initialWallet(),coins:Number.MAX_SAFE_INTEGER};assert.throws(()=>awardFirstClear(wallet,'a'));assert.equal(wallet.coins,Number.MAX_SAFE_INTEGER);assert.deepEqual(wallet.claimed,[]);
});
