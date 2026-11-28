import type {Progress} from './progress.mjs';
export type DiscoveryBadge={id:string;title:string;description:string;metric:'completed'|'perfect'|'challenge'|'stars';target:number;symbol:string;progress:number;earned:boolean};
export type DiscoveryCollection={stats:{completed:number;perfect:number;challenge:number;stars:number};badges:DiscoveryBadge[];earned:number;total:number};
export function discoveryCollection(records:Progress['records']):DiscoveryCollection;
