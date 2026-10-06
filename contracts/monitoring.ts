import { z } from 'zod';
export const scenarios = ['normal', 'pressure', 'critical'] as const;
export type Scenario = typeof scenarios[number];
export const scenarioNames: Record<Scenario, string> = { normal: '正常运行', pressure: '负载升高', critical: '资源告急' };
export const thresholdsSchema = z.object({ gpu: z.number().int().min(1).max(100), memory: z.number().int().min(1).max(100), disk: z.number().int().min(1).max(100), temperature: z.number().int().min(30).max(110), enabled: z.boolean() }).strict();
export type Thresholds = z.infer<typeof thresholdsSchema>;
export const defaults: Thresholds = { gpu: 90, memory: 90, disk: 85, temperature: 80, enabled: true };
export type GPU = { id: number; uuid?: string; unattributedMemory?: number; name: string; utilization: number; memoryUsed: number; memoryTotal: number; temperature: number; power: number; process: string; pid: number | null };
export type Disk = { mount: string; used: number; total: number; available?: number };
export type MonitorProcess = { gpuId: number; pid: number; startedAt?: string; taskSource?: "unknown" | "manual"; user: string; command: string; task: string; memoryUsed: number };
export type Snapshot = { schemaVersion: '1.0'; id: string; server: string; source: 'mock' | 'script'; capacityUnit?: 'GB' | 'GiB'; scenario: Scenario; capturedAt: string; gpus: GPU[]; processes?: MonitorProcess[]; disks: Disk[]; history: { time: string; gpu: number; memory: number }[] };
export type Alert = { id: string; resource: string; metric: string; value: number; threshold: number; unit: string; severity: 'warning' | 'critical' };
export type Analysis = { schemaVersion: '1.0'; generatedAt: string; snapshotId: string; provider: 'rules-mock' | 'rules' | 'llm'; status: 'normal' | 'warning' | 'critical'; summary: string; evidence: string[]; recommendations: string[]; alerts: Alert[]; thresholds: Thresholds };
export const snapshotSchema = z.object({ schemaVersion: z.literal('1.0'), id: z.string().min(1).max(100), server: z.string().min(1).max(100), source: z.enum(['mock','script']), capacityUnit:z.enum(['GB','GiB']).optional(), scenario: z.enum(scenarios), capturedAt: z.string().datetime(), gpus: z.array(z.object({id:z.number().int().min(0),uuid:z.string().max(100).optional(),unattributedMemory:z.number().min(0).optional(),name:z.string().max(100),utilization:z.number().min(0).max(100),memoryUsed:z.number().min(0),memoryTotal:z.number().positive(),temperature:z.number().min(0).max(150),power:z.number().min(0),process:z.string().max(100),pid:z.number().int().positive().nullable()}).refine(g=>g.memoryUsed<=g.memoryTotal,'显存用量超过容量')).max(64), disks: z.array(z.object({mount:z.string().max(100),available:z.number().min(0).optional(),used:z.number().min(0),total:z.number().positive()}).refine(d=>d.used<=d.total,'磁盘用量超过容量')).max(32), processes:z.array(z.object({gpuId:z.number().int().min(0),pid:z.number().int().positive(),startedAt:z.string().datetime().optional(),taskSource:z.enum(["unknown","manual"]).optional(),user:z.string().min(1).max(80),command:z.string().min(1).max(500),task:z.string().min(1).max(200),memoryUsed:z.number().min(0)})).max(512).optional(), history:z.array(z.object({time:z.string().max(100),gpu:z.number().min(0).max(100),memory:z.number().min(0).max(100)})).max(240) }).superRefine((s,ctx)=>{
  const seen=new Set<string>();
  for(const p of s.processes??[]){const key=p.gpuId+':'+p.pid;if(seen.has(key)||!s.gpus.some(g=>g.id===p.gpuId))ctx.addIssue({code:z.ZodIssueCode.custom,message:'进程 GPU 不存在或 PID-GPU 记录重复',path:['processes']});seen.add(key);}
});
export function createMockSnapshot(scenario: Scenario, tick = 0): Snapshot {
  const base = scenario === 'normal' ? [42,18,57,8,35,61,12,29] : scenario === 'pressure' ? [62,36,76,15,53,92,28,48] : [94,85,97,72,91,99,64,95];
  const memory = scenario === 'normal' ? [32,14,45,4,27,52,9,21] : scenario === 'pressure' ? [48,25,61,8,43,74,18,36] : [73,68,78,59,75,79,52,77];
  const now = new Date();
  const gpus = base.map((v,id): GPU => ({ id, name: 'NVIDIA A800', utilization: Math.max(0,Math.min(100,v+(tick%3-1)*2)), memoryUsed: memory[id], memoryTotal: 80, temperature: scenario==='critical'? 78+id*2:48+Math.round(v/5), power:Math.round(70+v*2.8), process:id===5?'vllm serve':id===0||id===2?'docagent.py':'train.py', pid:18040+id*17 }));
  const users=['alice','bob','alice','chen','bob','svc-llm','chen','alice'];
  const tasks=['文档问答评测','模型训练','文档问答评测','数据预处理','模型训练','模型推理服务','LoRA 微调','评测任务'];
  const commands=['python docagent.py --eval','python train.py --config a800.yaml','python docagent.py --eval','python preprocess.py --batch 32','python train.py --config a800.yaml','vllm serve Qwen --tensor-parallel-size 1','python finetune.py --lora','python eval.py --dataset docbench'];
  const processes: MonitorProcess[] = gpus.map(g=>({gpuId:g.id,pid:g.id===2?18040:g.id===4?18057:g.pid!,user:users[g.id],command:commands[g.id],task:tasks[g.id],memoryUsed:g.memoryUsed}));
  for(const id of [0,5]) { const primary=processes.find(p=>p.gpuId===id)!; const share=Math.min(id===0?4:14,Math.floor(primary.memoryUsed/3)); primary.memoryUsed-=share; processes.push({gpuId:id,pid:19200+id,user:id===0?'bob':'alice',command:'python inference.py --batch 8',task:'批量推理',memoryUsed:share}); }
  gpus.forEach(g=>{const p=processes.filter(p=>p.gpuId===g.id).sort((a,b)=>b.memoryUsed-a.memoryUsed)[0];g.pid=p.pid;g.process=p.command.split(' --')[0];});
  const disks = [{mount:'/data',used:scenario==='normal'?1260:scenario==='pressure'?1760:1940,total:2000},{mount:'/home',used:scenario==='critical'?448:305,total:500},{mount:'/',used:72,total:200}];
  return {schemaVersion:'1.0',id:`sample-${now.getTime()}-${tick}`,server:'a800-lab-01',source:'mock',scenario,capturedAt:now.toISOString(),gpus,processes,disks,history:Array.from({length:16},(_,i)=>({time:new Date(now.getTime()-(15-i)*60000).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Shanghai'}),gpu:Math.round(gpus.reduce((s,g)=>s+g.utilization,0)/8 + Math.sin(i*1.4)*6-(15-i)*0.5),memory:Math.round(gpus.reduce((s,g)=>s+g.memoryUsed/g.memoryTotal*100,0)/8 + Math.sin(i*0.8)*3)}))};
}
export function evaluate(snapshot: Snapshot, t: Thresholds, ignoreEnabled = false): Alert[] {
  if(!t.enabled && !ignoreEnabled)return [];
  const result: Alert[] = [];
  const add=(id:string,resource:string,metric:string,value:number,threshold:number,unit:string)=>{if(value>=threshold)result.push({id,resource,metric,value,threshold,unit,severity:(unit==='°C'?value>=threshold+5:value>=95)?'critical':'warning'});};
  snapshot.gpus.forEach(g=>{add(`gpu-${g.id}-util`,`GPU ${g.id}`,'GPU 使用率',g.utilization,t.gpu,'%');add(`gpu-${g.id}-memory`,`GPU ${g.id}`,'显存使用率',Math.round(g.memoryUsed/g.memoryTotal*1000)/10,t.memory,'%');add(`gpu-${g.id}-temp`,`GPU ${g.id}`,'温度',g.temperature,t.temperature,'°C');});
  snapshot.disks.forEach(d=>add(`disk-${d.mount}`,d.mount,'存储使用率',Math.round(d.used/d.total*1000)/10,t.disk,'%'));
  return result;
}
export function analyzeSnapshot(s: Snapshot, t: Thresholds): Analysis {
  const risks=evaluate(s,t,true), alerts=evaluate(s,t);
  const status=risks.some(a=>a.severity==='critical')?'critical':risks.length?'warning':'normal';
  const maxGPU=[...s.gpus].sort((a,b)=>b.utilization-a.utilization)[0],maxDisk=[...s.disks].sort((a,b)=>b.used/b.total-a.used/a.total)[0];
  return {schemaVersion:'1.0',generatedAt:new Date().toISOString(),snapshotId:s.id,provider:s.source==='script'?'rules':'rules-mock',status,summary:risks.length?`发现 ${risks.length} 项指标达到告警阈值。${status==='critical'?'部分资源接近容量上限，建议优先处理。':'建议在启动下一批任务前检查资源余量。'}`:'当前 GPU 与存储指标均低于设定阈值，可继续观察。',evidence:risks.length?risks.map(a=>`${a.resource} · ${a.metric} ${a.value}${a.unit}，阈值 ${a.threshold}${a.unit}。`):[maxGPU?`最高 GPU 使用率为 ${maxGPU.utilization}%（GPU ${maxGPU.id}），阈值 ${t.gpu}%。`:'当前未返回 GPU。',maxDisk?`${maxDisk.mount} 使用率 ${(maxDisk.used/maxDisk.total*100).toFixed(1)}%，剩余 ${maxDisk.available??maxDisk.total-maxDisk.used} ${s.capacityUnit??'GB'}，阈值 ${t.disk}%。`:'当前未返回磁盘。'],recommendations:status==='normal'?['继续观察下一次采样；新任务启动前核对显存和磁盘余量。']:['检查高占用 GPU 的进程和任务队列，确认是否属于预期负载。',...(risks.some(a=>a.id.startsWith('disk'))?['核对数据目录、模型缓存与日志大小，确认归属后再归档或清理。']:[]),...(risks.some(a=>a.metric==='温度')?['检查散热与风扇状态，并观察温度是否持续升高。']:[]),'本次仅提供建议，不自动终止进程或删除文件。'],alerts,thresholds:t};
}
export function alertText(s: Snapshot, alerts: Alert[]): string {
  return `主题：[Server Watch] ${s.server} · ${alerts.length} 项告警\n\n服务器：${s.server}\n采样时间：${new Date(s.capturedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}（北京时间）\n数据来源：${s.source==='mock'?'模拟数据':'监控脚本'}\n\n${alerts.map(a=>`[${a.severity==='critical'?'严重':'关注'}] ${a.resource} ${a.metric} ${a.value}${a.unit} ≥ ${a.threshold}${a.unit}`).join('\n')}\n\n建议：核对相关任务与资源余量，按分析结果处理。\n此内容为告警预览，尚未发送。`;
}
