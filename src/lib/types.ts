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

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}
