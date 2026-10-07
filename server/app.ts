import {Readable} from 'node:stream';
import {nodeAssistantService} from './assistant-repository';
import Fastify,{type FastifyError} from 'fastify';
import staticFiles from '@fastify/static';
import {resolve} from 'node:path';
import {scenarios, snapshotSchema, thresholdsSchema,type Scenario} from '../contracts/monitoring';
import {questionSchema,userStatistics} from '../contracts/questions';
import {analysisAdapter,questionAdapter} from '../lib/adapters';
import {z} from 'zod';
import {MonitorService} from './monitor-service';
import {PiRuntime} from './pi-runtime';
import {StorageService} from './storage-service';
import {InferenceService} from './inference-service';
const analysisInput=z.object({snapshot:snapshotSchema,thresholds:thresholdsSchema});
export function createServer(){
 const monitor=new MonitorService();
 const assistant=nodeAssistantService(process.env.SERVER_WATCH_ASSISTANT_ENGINE==='direct'?undefined:new PiRuntime(monitor));
 const storage=new StorageService();const inferences=new InferenceService(monitor,assistant);
 const app=Fastify({logger:true,bodyLimit:100000});
 app.addHook('onReady',async()=>monitor.start());
 app.addHook('onClose',async()=>{await storage.stop();await monitor.stop();});
 app.addHook('onSend',async(_request,reply)=>{reply.header('Cache-Control','no-store');});
 app.get('/api/assistant',async()=>assistant.state());
 app.post('/api/assistant',async(request,reply)=>{const abort=new AbortController();const disconnected=()=>{if(!reply.raw.writableFinished)abort.abort();};request.raw.once('aborted',disconnected);reply.raw.once('close',disconnected);reply.raw.once('finish',()=>{request.raw.removeListener('aborted',disconnected);reply.raw.removeListener('close',disconnected);});try{const result=await assistant.action(request.body,abort.signal);if(result instanceof Response){reply.header('Content-Type','application/x-ndjson');return reply.send(Readable.fromWeb(result.body as import('node:stream/web').ReadableStream));}return result;}catch(e){return reply.code(400).send({error:e instanceof Error?e.message:'请求无效'});}});
 const guarded=(handler:(body:any,signal:AbortSignal)=>Promise<unknown>)=>async(request:any,reply:any)=>{const abort=new AbortController();const close=()=>{if(!reply.raw.writableFinished)abort.abort();};reply.raw.once('close',close);try{return await handler(request.body??request.query,abort.signal);}catch(e){return reply.code(400).send({error:e instanceof Error?e.message:'请求失败'});}finally{reply.raw.removeListener('close',close);}};
 app.get('/api/storage/roots',guarded(async()=>({roots:await storage.roots()})));
 app.get('/api/storage/list',guarded(async raw=>{const q=z.object({path:z.string().min(1).max(4096),offset:z.coerce.number().int().min(0).max(10000).default(0),limit:z.coerce.number().int().min(1).max(1000).default(100)}).strict().parse(raw);return storage.list(q.path,q.offset,q.limit);}));
 app.get('/api/storage/cache',guarded(async raw=>({job:await storage.cached(z.object({path:z.string().min(1).max(4096)}).strict().parse(raw).path)??null})));
 app.post('/api/storage/scan',guarded(async raw=>{const q=z.object({path:z.string().min(1).max(4096),refresh:z.boolean().default(false)}).strict().parse(raw);return storage.scan(q.path,q.refresh);}));
 app.get('/api/storage/job',guarded(async raw=>storage.status(z.object({id:z.string().uuid()}).strict().parse(raw).id)));
 app.post('/api/storage/cancel',guarded(async raw=>storage.cancel(z.object({id:z.string().uuid()}).strict().parse(raw).id)));
 app.get('/api/process/inference',guarded(async raw=>({inference:await inferences.cached(z.object({pid:z.coerce.number().int().positive()}).strict().parse(raw).pid)??null})));
 app.post('/api/process/inference',guarded(async(raw,signal)=>{const q=z.object({pid:z.number().int().positive(),refresh:z.boolean().default(false)}).strict().parse(raw);return inferences.infer(q.pid,q.refresh,signal);}));
 app.get('/api/health',async()=>monitor.health());
 app.get('/api/thresholds',async()=>monitor.thresholds());
 app.post('/api/thresholds',async(request,reply)=>{const value=thresholdsSchema.safeParse(request.body);if(!value.success)return reply.code(400).send({error:'阈值无效'});return monitor.saveThresholds(value.data);});
 app.get('/api/monitor',async(request,reply)=>{
  const q=request.query as Record<string,string>;const scenario=q.scenario??'pressure',tick=Number(q.tick??0);
  if(!scenarios.includes(scenario as Scenario)||!Number.isInteger(tick)||tick<0||tick>1000000)return reply.code(400).send({error:'无效的采样参数'});
  try{return await monitor.collect(scenario as Scenario,tick);}catch{return reply.code(503).send({error:'真实采集失败；保留上次采样，请稍后重试'});}
 });
 app.post('/api/analyze',async(request,reply)=>{const p=analysisInput.safeParse(request.body);if(!p.success)return reply.code(400).send({error:'监控数据或阈值无效'});return analysisAdapter.analyze(p.data.snapshot,p.data.thresholds);});
 app.post('/api/chat',async(request,reply)=>{const p=questionSchema.safeParse(request.body);if(!p.success)return reply.code(400).send({error:'问题或监控数据无效'});return questionAdapter.answer(p.data);});
 app.post('/api/users',async(request,reply)=>{const p=snapshotSchema.safeParse(request.body);if(!p.success)return reply.code(400).send({error:'监控数据无效'});return userStatistics(p.data);});
 app.setErrorHandler((error,_request,reply)=>{app.log.error(error);const status=(error as FastifyError).statusCode??503;reply.code(status).send({error:status===413?'请求过大':'服务暂时不可用'});});
 app.register(staticFiles,{root:resolve('public/console'),prefix:'/console/'});
 app.get('/',async(_request,reply)=>reply.redirect('/console/index.html'));
 return app;
}
