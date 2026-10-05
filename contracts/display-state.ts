import type {Snapshot,Alert} from './monitoring';
export const sampleExpiryMs=120000;
export type ObservationState='current'|'stale'|'failed';
export function observationState(snapshot:Snapshot,now:number,failed:boolean):ObservationState{
 if(failed)return 'failed';
 return now-Date.parse(snapshot.capturedAt)>=sampleExpiryMs?'stale':'current';
}
export function resourceState(issues:Alert[],observation:ObservationState){
 if(observation==='failed')return {label:'采样失败',tone:'danger' as const,detail:'刷新失败，以下为上次成功采样。'};
 if(observation==='stale')return {label:'数据过期',tone:'warning' as const,detail:'采样已超过 2 分钟，请刷新后判断当前状态。'};
 if(!issues.length)return {label:'低于阈值',tone:'info' as const,detail:'本次采样指标均低于当前生效阈值。'};
 const names:Record<string,string>={'GPU 使用率':'利用率','显存使用率':'显存','存储使用率':'存储','温度':'温度'};
 return {label:issues.length===1?(names[issues[0].metric]??issues[0].metric)+'达阈值':issues.length+' 项达阈值',tone:issues.some(a=>a.severity==='critical')?'danger' as const:'warning' as const,detail:issues.map(a=>`${a.metric} ${a.value}${a.unit} ≥ ${a.threshold}${a.unit}`).join('；')};
}
