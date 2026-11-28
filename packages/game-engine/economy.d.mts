export type Wallet={coins:number;xp:number;hints:number;claimed:string[]};
export type Grant={first:boolean;coins:number;xp:number};
export const BALANCE:Readonly<{firstClearCoins:number;firstClearXp:number;xpPerLevel:number;hintCost:number}>;
export function initialWallet():Wallet;
export function levelProgress(xp:number):{level:number;current:number;required:number};
export function awardFirstClear(wallet:Wallet,stageId:string):{wallet:Wallet;grant:Grant};
export function exchangeHint(wallet:Wallet):{wallet:Wallet;ok:boolean};
export function spendStockHint(wallet:Wallet):{wallet:Wallet;ok:boolean};
