import { createMockSnapshot, analyzeSnapshot, type Scenario, type Snapshot, type Thresholds, type Analysis } from './monitoring';
// Replace these adapters to integrate an HTTP collector and a server-side LLM.
// Keep the versioned contracts in monitoring.ts. Never expose credentials to clients.
export interface MonitorAdapter { collect(scenario: Scenario, tick: number): Promise<Snapshot> }
export interface AnalysisAdapter { analyze(snapshot: Snapshot, thresholds: Thresholds): Promise<Analysis> }
export const monitorAdapter: MonitorAdapter = { async collect(scenario, tick) { return createMockSnapshot(scenario,tick); } };
export const analysisAdapter: AnalysisAdapter = { async analyze(snapshot, thresholds) { return analyzeSnapshot(snapshot,thresholds); } };

import { answerQuestion, type QuestionInput, type QuestionReply } from './questions';
export interface QuestionAdapter { answer(input: QuestionInput): Promise<QuestionReply> }
export const questionAdapter: QuestionAdapter = { async answer(input) { return answerQuestion(input); } };
