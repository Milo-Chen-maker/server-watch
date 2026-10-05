import {z} from 'zod';
export const providerSchema=z.object({id:z.string().uuid().optional(),name:z.string().trim().min(1).max(60),baseUrl:z.string().trim().url().max(500),apiKey:z.string().max(4096).optional(),clearKey:z.boolean().optional(),models:z.array(z.string().trim().min(1).max(150)).min(1).max(40),enabled:z.boolean(),isDefault:z.boolean()});
export type Provider={id:string;name:string;baseUrl:string;models:string[];enabled:boolean;isDefault:boolean;hasKey:boolean};
export type Message={id:string;role:'user'|'assistant';text:string;at:string;model:string;snapshotId:string;capturedAt:string;evidence?:string[];status?:'complete'|'stopped'|'error'};
export type Session={id:string;title:string;updatedAt:string;messages:Message[];busyUntil?:number};
export type AssistantState={providers:Provider[];sessions:Session[]};
