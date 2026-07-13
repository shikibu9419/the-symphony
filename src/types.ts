export interface LinearTeamNode {
  key: string;
}

export interface LinearProject {
  id: string;
  name: string;
  slugId?: string | null;
  content?: string | null;
  description?: string | null;
  teams?: { nodes: LinearTeamNode[] };
}

export interface LinearIssueSummary {
  identifier: string;
  title: string;
  [key: string]: unknown;
}

export interface LinearIssueComment {
  body?: string | null;
  [key: string]: unknown;
}

export interface LinearIssueDetail {
  identifier?: string;
  title?: string;
  description?: string | null;
  comments?: { nodes: LinearIssueComment[] } | LinearIssueComment[];
  [key: string]: unknown;
}

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}
