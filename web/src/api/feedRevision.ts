/** Server-owned sequence numbers detect lost socket frames across all tabs.
 * REST remains the source of truth; gaps trigger refetch, never fabricated data.
 */
export type FeedVersion={stream:string;sequence:number};
export type FeedRevisionDecision={next:FeedVersion|null;stale:boolean;refetch:boolean};
export function reconcileFeedRevision(previous:FeedVersion|null,payload:{
 syncStream?:unknown;syncSequence?:unknown;
}):FeedRevisionDecision {
 const stream=payload?.syncStream,sequence=payload?.syncSequence;
 if(typeof stream!=='string'||!stream||!Number.isSafeInteger(sequence)||
    (sequence as number)<1)return {next:previous,stale:false,refetch:false};
 const current={stream,sequence:sequence as number};
 if(!previous)return {next:current,stale:false,refetch:false};
 if(previous.stream!==current.stream)return {next:current,stale:false,refetch:true};
 if(current.sequence<=previous.sequence)return {next:previous,stale:true,refetch:false};
 return {next:current,stale:false,refetch:current.sequence>previous.sequence+1};
}
