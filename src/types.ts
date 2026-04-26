export type ReviewDecision = "pending" | "approved" | "rejected" | "read";
export type ChangeSource =
  | "committed"
  | "staged"
  | "working-tree"
  | "untracked";
export type LabelSource = "heuristic" | "ollama";

export interface RiskEvidence {
  flag: string;
  filePath: string;
  lineNumber?: number;
  snippet: string;
}

export interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
  patch: string;
  beforeComplexity: number;
  afterComplexity: number;
  source: ChangeSource;
}

export interface SemanticGroup {
  id: string;
  label: string;
  reason: string;
  files: DiffFile[];
  totalAdditions: number;
  totalDeletions: number;
  riskFlags: string[];
  riskEvidence: RiskEvidence[];
  decision: ReviewDecision;
  labelSource: LabelSource;
}

export interface OllamaStatus {
  configuredModel: string;
  enabled: boolean;
  reachable: boolean;
  usedForGroups: number;
  fallbackGroups: number;
  lastError?: string;
}

export interface AgentIntent {
  prompt: string;
  thinking: string;
  source: string;
  timestamp?: string;
}

export interface IntentDriftAlert {
  severity: "high" | "medium";
  title: string;
  message: string;
  evidence: string[];
  affectedFiles: string[];
}

export interface TopologyLink {
  from: string;
  to: string;
  relation: "impact" | "smell";
  reason: string;
  style: "solid" | "dashed";
}

export interface ReviewStep {
  id: string;
  title: string;
  description: string;
  groupIds: string[];
  filePaths: string[];
  riskCount: number;
}

export interface AnalysisResult {
  groups: SemanticGroup[];
  summary: string;
  confidenceScore: number;
  topologyLinks: TopologyLink[];
  intent: AgentIntent | null;
  intentDrift: IntentDriftAlert | null;
  steps: ReviewStep[];
  generatedAt: string;
  ollamaStatus: OllamaStatus;
}
