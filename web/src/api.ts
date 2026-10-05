import {snapshotSchema,type Snapshot,type Thresholds,type Analysis,type Scenario} from '../../contracts/monitoring';
import type {QuestionReply} from '../../contracts/questions';
async function request<T>(path:string,body?:unknown):Promise<T>{
 const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000),cache:'no-store'});
 const data=await response.json();if(!response.ok)throw Error(data.error??'请求失败');return data;
}
export const api={
 async monitor(scenario:Scenario,tick:number):Promise<Snapshot>{return snapshotSchema.parse(await request(`/api/monitor?scenario=${scenario}&tick=${tick}`));},
 analyze(snapshot:Snapshot,thresholds:Thresholds){return request<Analysis>('/api/analyze',{snapshot,thresholds});},
 question(question:string,snapshot:Snapshot,thresholds:Thresholds,history:{question:string}[]){return request<QuestionReply>('/api/chat',{question,snapshot,thresholds,history});}
};
