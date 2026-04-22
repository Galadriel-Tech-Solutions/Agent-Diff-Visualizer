export type ReviewDecision = "pending" | "approved" | "rejected";

export interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
  patch: string;
  beforeComplexity: number;
  afterComplexity: number;
}

export interface SemanticGroup {
  id: string;
  label: string;
  reason: string;
  files: DiffFile[];
  totalAdditions: number;
  totalDeletions: number;
  riskFlags: string[];
  decision: ReviewDecision;
}

export interface AgentIntent {
  prompt: string;
  thinking: string;
  source: string;
  timestamp?: string;
}

export interface AnalysisResult {
  groups: SemanticGroup[];
  summary: string;
  confidenceScore: number;
  topologyLinks: Array<{ from: string; to: string }>;
  intent: AgentIntent | null;
  generatedAt: string;
}
