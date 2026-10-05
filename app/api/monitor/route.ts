import { monitorAdapter } from '@/lib/adapters';
import { scenarios, type Scenario } from '@/lib/monitoring';
export async function GET(request: Request) {
  const url=new URL(request.url), scenario=url.searchParams.get('scenario')??'pressure', tick=Number(url.searchParams.get('tick')??0);
  if(!scenarios.includes(scenario as Scenario)||!Number.isInteger(tick)||tick<0||tick>1000000)return Response.json({error:'无效的采样参数'},{status:400});
  try{return Response.json(await monitorAdapter.collect(scenario as Scenario,tick),{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'采样失败，请稍后重试'},{status:503});}
}
