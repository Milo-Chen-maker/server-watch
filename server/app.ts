import {Readable} from 'node:stream';
import {nodeAssistantService} from './assistant-repository';
import Fastify,{type FastifyError} from 'fastify';
import staticFiles from '@fastify/static';
import {resolve} from 'node:path';
import {scenarios, snapshotSchema, thresholdsSchema,type Scenario} from '../contracts/monitoring';
import {questionSchema,userStatistics} from '../contracts/questions';
import {monitorAdapter,analysisAdapter,questionAdapter} from '../lib/adapters';
import {z} from 'zod';
const analysisInput=z.object({snapshot:snapshotSchema,thresholds:thresholdsSchema});
export function createServer(){
 const assistant=nodeAssistantService();
 const app=Fastify({logger:true,bodyLimit:100000});
 app.addHook('onSend',async(_request,reply)=>{reply.header('Cache-Control','no-store');});
 app.get('/api/assistant',async()=>assistant.state());
 app.post('/api/assistant',async(request,reply)=>{try{const result=await assistant.action(request.body);if(result instanceof Response){reply.header('Content-Type','application/x-ndjson');return reply.send(Readable.fromWeb(result.body as import('node:stream/web').ReadableStream));}return result;}catch(e){return reply.code(400).send({error:e instanceof Error?e.message:'请求无效'});}});
 app.get('/api/health',async()=>({status:'ok',mode:'mock'}));
 app.get('/api/monitor',async(request,reply)=>{
  const q=request.query as Record<string,string>;const scenario=q.scenario??'pressure',tick=Number(q.tick??0);
  if(!scenarios.includes(scenario as Scenario)||!Number.isInteger(tick)||tick<0||tick>1000000)return reply.code(400).send({error:'无效的采样参数'});
  return monitorAdapter.collect(scenario as Scenario,tick);
 });
 app.post('/api/analyze',async(request,reply)=>{const p=analysisInput.safeParse(request.body);if(!p.success)return reply.code(400).send({error:'监控数据或阈值无效'});return analysisAdapter.analyze(p.data.snapshot,p.data.thresholds);});
 app.post('/api/chat',async(request,reply)=>{const p=questionSchema.safeParse(request.body);if(!p.success)return reply.code(400).send({error:'问题或监控数据无效'});return questionAdapter.answer(p.data);});
 app.post('/api/users',async(request,reply)=>{const p=snapshotSchema.safeParse(request.body);if(!p.success)return reply.code(400).send({error:'监控数据无效'});return userStatistics(p.data);});
 app.setErrorHandler((error,_request,reply)=>{app.log.error(error);const status=(error as FastifyError).statusCode??503;reply.code(status).send({error:status===413?'请求过大':'服务暂时不可用'});});
 app.register(staticFiles,{root:resolve('public/console'),prefix:'/console/'});
 app.get('/',async(_request,reply)=>reply.redirect('/console/index.html'));
 return app;
}
