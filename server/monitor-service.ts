import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {snapshotSchema,thresholdsSchema,defaults,type Snapshot,type Thresholds} from '../contracts/monitoring';
import {monitorAdapter} from '../lib/adapters';

const execute=promisify(execFile);
async function readSample(){const {stdout}=await execute(process.env.SERVER_WATCH_PYTHON??'python3',[fileURLToPath(new URL('./collector.py',import.meta.url))],{timeout:12000,maxBuffer:2_000_000});return JSON.parse(stdout);}
export class MonitorService {
 readonly mode=process.env.SERVER_WATCH_MONITOR_MODE==='script'?'script':'mock';
 private root=resolve(process.env.SERVER_WATCH_DATA_DIR??'server-data');
 private latest?:Snapshot;
 private failed=false;
 private collecting?:Promise<void>;
 private timer?:ReturnType<typeof setInterval>;
 private writes=Promise.resolve();
 constructor(private readonly read=readSample){}
 async start(){
  if(this.mode!=='script')return;
  try{this.latest=snapshotSchema.parse(JSON.parse(await readFile(resolve(this.root,'snapshot.json'),'utf8')));}catch{}
  await this.sample();
  this.timer=setInterval(()=>void this.sample(),15000);
  this.timer.unref();
 }
 async stop(){if(this.timer)clearInterval(this.timer);await this.collecting;}
 private async store(name:string,value:unknown){
  await mkdir(this.root,{recursive:true,mode:0o700});
  const file=resolve(this.root,name),tmp=file+'.'+crypto.randomUUID()+'.tmp';
  await writeFile(tmp,JSON.stringify(value),{mode:0o600});await rename(tmp,file);
 }
 private sample(){
  if(this.collecting)return this.collecting;
  this.collecting=(async()=>{
   try{
    const next=snapshotSchema.parse(await this.read());
    if(next.source!=='script')throw Error('invalid source');
    const gpu=next.gpus.length?next.gpus.reduce((sum,g)=>sum+g.utilization,0)/next.gpus.length:0;
    const total=next.gpus.reduce((sum,g)=>sum+g.memoryTotal,0);
    const memory=total?next.gpus.reduce((sum,g)=>sum+g.memoryUsed,0)/total*100:0;
    next.history=[...(this.latest?.history??[]),{time:new Date(next.capturedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'Asia/Shanghai'}),gpu,memory}].slice(-240);
    await this.store('snapshot.json',next);this.latest=next;this.failed=false;
   }catch{this.failed=true;}
  })().finally(()=>{this.collecting=undefined;});
  return this.collecting;
 }
 async collect(scenario:Parameters<typeof monitorAdapter.collect>[0],tick:number){
  if(this.mode==='mock')return monitorAdapter.collect(scenario,tick);
  if(this.failed||!this.latest)throw Error('真实采集失败，请检查采集器；未返回模拟数据');
  return this.latest;
 }
 health(){return {status:this.mode==='script'&&(this.failed||!this.latest)?'degraded':'ok',mode:this.mode,capturedAt:this.latest?.capturedAt};}
 async thresholds():Promise<Thresholds>{try{return thresholdsSchema.parse(JSON.parse(await readFile(resolve(this.root,'thresholds.json'),'utf8')));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {...defaults};throw Error('服务端阈值读取失败');}}
 async saveThresholds(raw:unknown){
  const value=thresholdsSchema.parse(raw);
  const operation=this.writes.then(()=>this.store('thresholds.json',value));
  this.writes=operation.catch(()=>{});await operation;return value;
 }
}
