// Provisional practice balance. Kept together so QA can tune without changing rules.
export const BALANCE=Object.freeze({firstClearCoins:100,firstClearXp:60,xpPerLevel:100,hintCost:25});
export const initialWallet=()=>({coins:0,xp:0,hints:0,claimed:[]});
const add=(a,b)=>{const n=a+b;if(!Number.isSafeInteger(n)||n<0)throw RangeError('Wallet overflow');return n;};
export function levelProgress(xp){return {level:1+Math.floor(xp/BALANCE.xpPerLevel),current:xp%BALANCE.xpPerLevel,required:BALANCE.xpPerLevel};}
export function awardFirstClear(wallet,stageId){
 if(!/^[\w-]{1,80}$/.test(stageId)||['__proto__','constructor','prototype'].includes(stageId))throw Error('Invalid stage ID');
 if(wallet.claimed.includes(stageId))return {wallet,grant:{first:false,coins:0,xp:0}};
 return {wallet:{...wallet,coins:add(wallet.coins,BALANCE.firstClearCoins),xp:add(wallet.xp,BALANCE.firstClearXp),claimed:[...wallet.claimed,stageId]},grant:{first:true,coins:BALANCE.firstClearCoins,xp:BALANCE.firstClearXp}};
}
export function exchangeHint(wallet){
 if(wallet.coins<BALANCE.hintCost)return {wallet,ok:false};
 return {wallet:{...wallet,coins:wallet.coins-BALANCE.hintCost,hints:add(wallet.hints,1)},ok:true};
}
export function spendStockHint(wallet){return wallet.hints>0?{wallet:{...wallet,hints:wallet.hints-1},ok:true}:{wallet,ok:false};}
