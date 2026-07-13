// Linear へのアクセスは全てここを経由して `linear` CLI (linear-cli) を
// サブプロセス起動して行う。MCP や Linear API 直叩き、SDK は一切使わない。

import { LINEAR_BIN } from "./constants";
import type { LinearIssueDetail, LinearIssueSummary, RunResult } from "./types";

export function run(cmd: string[], opts: { cwd?: string } = {}): RunResult {
  const proc = Bun.spawnSync(cmd, {
    cwd: opts.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout ? new TextDecoder().decode(proc.stdout) : "",
    stderr: proc.stderr ? new TextDecoder().decode(proc.stderr) : "",
  };
}

/** 生の GraphQL passthrough (`linear graphql`)。失敗時は例外を投げる。 */
export function linearGraphql<T = any>(query: string, variables?: unknown): T {
  const cmd = [LINEAR_BIN, "graphql", query];
  if (variables !== undefined) {
    cmd.push("--vars", JSON.stringify(variables));
  }
  const r = run(cmd);
  if (r.exitCode !== 0) {
    throw new Error(`linear graphql failed: ${r.stderr.trim()}`);
  }
  return JSON.parse(r.stdout) as T;
}

/** `linear issue list --project <name> --limit 50` */
export function listIssues(projectName: string): LinearIssueSummary[] {
  const r = run([LINEAR_BIN, "issue", "list", "--project", projectName, "--limit", "50"]);
  if (r.exitCode !== 0) {
    // 失敗を [] に潰すと「issue なし」と誤認して重複作成するため、必ず投げる。
    throw new Error(`linear issue list failed for '${projectName}' (exit ${r.exitCode}): ${r.stderr.trim()}`);
  }
  const data = JSON.parse(r.stdout);
  return (data.issues ?? []) as LinearIssueSummary[];
}

/** issue の description と全コメント本文を返す (repo: 明示の探索用)。 */
export function issueTexts(identifier: string): (string | null | undefined)[] {
  const r = run([LINEAR_BIN, "issue", "get", identifier]);
  if (r.exitCode !== 0) {
    throw new Error(`linear issue get '${identifier}' failed (exit ${r.exitCode}): ${r.stderr.trim()}`);
  }
  const d = JSON.parse(r.stdout);
  const issue: LinearIssueDetail = d.issue ?? d;
  const texts: (string | null | undefined)[] = [issue.description];
  let comments: unknown = issue.comments;
  if (comments && typeof comments === "object" && !Array.isArray(comments)) {
    comments = (comments as { nodes?: unknown }).nodes ?? [];
  }
  for (const c of (comments as unknown[] | undefined) ?? []) {
    if (c && typeof c === "object") {
      texts.push((c as { body?: string | null }).body);
    }
  }
  return texts;
}

/** `linear issue create --title T --team K [--project P] --description D` */
export function issueCreate(title: string, team: string, project: string, description: string): RunResult {
  return run([LINEAR_BIN, "issue", "create", "--title", title, "--team", team, "--project", project, "--description", description]);
}
