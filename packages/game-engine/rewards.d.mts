export type Entry={score:number;stars:number;elapsed:number;wrong:number;hints:number};
export type RecordSet={first:Entry;best:Entry;recent:Entry;maxStars:number};
export function evaluate(input:{answers:{id:number;difficulty?:string}[];found:number[];wrong:number;hints:number;mode:string;remaining:number;cleared:boolean}):{base:number;clearBonus:number;accuracyBonus:number;hintBonus:number;timeBonus:number;score:number;stars:number};
export function record(previous:RecordSet|undefined,entry:Entry):RecordSet;
