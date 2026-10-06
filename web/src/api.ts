import {thresholdsSchema,snapshotSchema,type Snapshot,type Thresholds,type Analysis,type Scenario} from '../../contracts/monitoring';
import type {QuestionReply} from '../../contracts/questions';
async function request<T>(path:string,body?:unknown):Promise<T>{
 const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000),cache:'no-store'});
 if(response.status===404)throw Object.assign(Error('接口不存在'),{status:404});const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error??'请求失败'),{status:response.status});return data;
}
export const api={
 async thresholds(){try{return thresholdsSchema.parse(await request('/api/thresholds'));}catch(e){if((e as {status?:number}).status===404)return undefined;throw e;}},
 saveThresholds(value:Thresholds){return request<Thresholds>('/api/thresholds',value);},
 async monitor(scenario:Scenario,tick:number):Promise<Snapshot>{return snapshotSchema.parse(await request(`/api/monitor?scenario=${scenario}&tick=${tick}`));},
 analyze(snapshot:Snapshot,thresholds:Thresholds){return request<Analysis>('/api/analyze',{snapshot,thresholds});},
 question(question:string,snapshot:Snapshot,thresholds:Thresholds,history:{question:string}[]){return request<QuestionReply>('/api/chat',{question,snapshot,thresholds,history});}
};
