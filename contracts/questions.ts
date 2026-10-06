import { z } from 'zod';
import { snapshotSchema, thresholdsSchema, evaluate, analyzeSnapshot, type Snapshot, type Thresholds } from './monitoring';
export const questionSchema=z.object({question:z.string().trim().min(1).max(1000),snapshot:snapshotSchema,thresholds:thresholdsSchema,history:z.array(z.object({question:z.string().max(1000)})).max(6).default([])}).strict();
export type QuestionInput=z.infer<typeof questionSchema>;
export type QuestionReply={provider:'rules-mock'|'rules'|'llm';snapshotId:string;answeredAt:string;answer:string;evidence:string[]};
export function userStatistics(s:Snapshot){
  return [...new Set((s.processes??[]).map(p=>p.user))].map(user=>{const rows=(s.processes??[]).filter(p=>p.user===user);return {user,gpuIds:[...new Set(rows.map(p=>p.gpuId))].sort((a,b)=>a-b),processCount:new Set(rows.map(p=>p.pid)).size,memoryUsed:Math.round(rows.reduce((sum,p)=>sum+p.memoryUsed,0)*10)/10,tasks:[...new Set(rows.map(p=>p.task))]};}).sort((a,b)=>b.memoryUsed-a.memoryUsed);
}
export function answerQuestion({question:q,snapshot:s,thresholds:t,history}:QuestionInput):QuestionReply{
  let question=q; if(/^(它|他|这个|那|这些|怎么处理|怎么办|为什么)/.test(q)&&history.length)question=history.at(-1)!.question+' '+q;
  const gpuMatch=question.match(/gpu\s*[#号]?\s*(\d+)/i), user=userStatistics(s).find(u=>question.toLowerCase().includes(u.user.toLowerCase())), alerts=evaluate(s,t,true);
  let answer='',evidence:string[]=[];
  const describe=(p:NonNullable<Snapshot['processes']>[number])=>`${p.user} · GPU ${p.gpuId} · PID ${p.pid} · ${p.task} · 显存 ${p.memoryUsed} ${s.capacityUnit??'GB'}\n命令：${p.command}`;
  if(/设置|调整|修改|阈值/.test(q)){
    answer=`当前阈值：GPU ${t.gpu}%，显存 ${t.memory}%，磁盘 ${t.disk}%，温度 ${t.temperature}°C。${t.enabled?'告警判断已启用。':'告警判断已暂停。'}进入左侧“设置”，填写数值，然后点击“保存设置”。达到或超过阈值即触发。`;
  }else if(gpuMatch){
    const id=Number(gpuMatch[1]),g=s.gpus.find(g=>g.id===id),rows=(s.processes??[]).filter(p=>p.gpuId===id);
    if(!g)answer=`本次采样没有 GPU ${id}。可用设备：${s.gpus.map(g=>'GPU '+g.id).join('、')}。`;
    else {answer=`GPU ${id} 当前使用率 ${g.utilization}%，显存 ${g.memoryUsed}/${g.memoryTotal} ${s.capacityUnit??'GB'}，温度 ${g.temperature}°C。${rows.length?'当前进程归属于 '+[...new Set(rows.map(p=>p.user))].join('、')+'。':'采样尚未提供进程归属。'}`;evidence=rows.map(describe);if(/为什么|原因|怎么|怎么办|处理/.test(question))answer+=' 单次采样只能说明当前占用，无法确定异常原因。可先核对以下命令与任务是否符合预期，再决定是否调整任务；本面板不会终止进程。';}
  }else if(user){
    answer=`${user.user} 在 GPU ${user.gpuIds.join('、')} 上运行 ${user.processCount} 个进程，已归属显存合计 ${user.memoryUsed} ${s.capacityUnit??'GB'}。任务包括：${user.tasks.join('、')}。`;evidence=(s.processes??[]).filter(p=>p.user===user.user).map(describe);
  }else if(/用户|谁|哪个人|进程|占用最多|归属/.test(question)){
    const users=userStatistics(s);answer=users.length?`本次采样识别到 ${users.length} 位用户、${new Set((s.processes??[]).map(p=>p.pid)).size} 个进程。按已归属显存排序，${users[0].user} 占用最多（${users[0].memoryUsed} ${s.capacityUnit??'GB'}）。同一进程跨多张 GPU 时只计为一个进程。`:'采样没有提供用户和进程信息，不能确定资源归属。';evidence=users.map(u=>`${u.user} · GPU ${u.gpuIds.join('、')} · ${u.processCount} 个进程 · ${u.memoryUsed} ${s.capacityUnit??'GB'} · ${u.tasks.join('、')}`);
  }else if(/磁盘|存储|空间|目录|data|home/.test(question)){
    answer='下面按挂载点列出当前存储用量。只有挂载点容量信息，不能据此判断具体哪些文件可删除。';evidence=s.disks.map(d=>`${d.mount}：${(d.used/d.total*100).toFixed(1)}%，已用 ${d.used}/${d.total} ${s.capacityUnit??'GB'}，剩余 ${d.available??d.total-d.used} ${s.capacityUnit??'GB'}，阈值 ${t.disk}%。`);
  }else if(/温度|散热/.test(question)){
    answer=`温度阈值为 ${t.temperature}°C。达到或超过阈值的设备有 ${s.gpus.filter(g=>g.temperature>=t.temperature).length} 张。`;evidence=s.gpus.map(g=>`GPU ${g.id}：${g.temperature}°C。`);
  }else if(/显存|空闲|可用|余量/.test(question)){
    answer='按剩余显存从多到少排列如下。实际能否运行新任务，还需要结合模型大小和上下文长度判断。';evidence=[...s.gpus].sort((a,b)=>(b.memoryTotal-b.memoryUsed)-(a.memoryTotal-a.memoryUsed)).map(g=>`GPU ${g.id}：剩余 ${g.memoryTotal-g.memoryUsed} ${s.capacityUnit??'GB'}，使用率 ${g.utilization}%。`);
  }else if(/告警|风险|异常|情况|状态|分析|建议|检查/.test(question)){
    answer=alerts.length?`按当前阈值，${alerts.length} 项指标达到触发条件。GPU 高使用率也可能是正常计算负载，需结合用户任务判断。${!t.enabled?'告警已暂停，以下仅为资源风险。':''}`:'当前指标均低于设定阈值。';evidence=alerts.map(a=>`${a.resource} · ${a.metric} ${a.value}${a.unit} ≥ ${a.threshold}${a.unit}`);
  }else answer='这是基于当前采样的规则问答，尚未接入 LLM。可以查询 GPU、显存、温度、存储、用户进程和告警，例如“GPU5 是谁在用、运行什么任务？”或“哪个用户占用显存最多？”。';
  if(/结论.*证据.*建议.*告警/.test(q)){const report=analyzeSnapshot(s,t);const relevant=gpuMatch?alerts.filter(a=>a.resource==='GPU '+Number(gpuMatch[1])):alerts;answer='结论\n'+answer+'\n\n证据\n'+(evidence.length?evidence:report.evidence).map(e=>'• '+e).join('\n')+'\n\n建议\n'+report.recommendations.map(e=>'• '+e).join('\n')+'\n\n告警\n'+(!t.enabled?'告警已暂停。':relevant.length?relevant.map(a=>`${a.resource} · ${a.metric} ${a.value}${a.unit} ≥ ${a.threshold}${a.unit}`).join('\n'):'当前指标低于阈值。');evidence=[];}
  return {provider:s.source==='script'?'rules':'rules-mock',snapshotId:s.id,answeredAt:new Date().toISOString(),answer,evidence};
}
