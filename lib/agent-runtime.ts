import type {Message,Provider,ToolRecord} from '../contracts/assistant';
import type {Snapshot,Thresholds} from '../contracts/monitoring';

/** Node supplies this adapter; the Sites worker keeps its direct completion adapter. */
export interface AgentRuntime {
 readonly engine:'pi';
 context():Promise<{snapshot:Snapshot;thresholds:Thresholds}>;
 run(input:{provider:Provider;apiKey?:string;model:string;question:string;history:Message[];snapshot:Snapshot;thresholds:Thresholds;signal:AbortSignal;delta:(text:string)=>void;tool:(record:ToolRecord)=>void;transcript:(messages:unknown[])=>void}):Promise<void>;
}
