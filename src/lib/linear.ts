// in-process の `linear-cli/lib` を profile 明示で叩く薄いラッパ。profile を全呼び出しに
// 渡すことで、書き込みが cwd の .linear-cli.json でなく常に同じ actor 名義になる。

import { createIssue as libCreateIssue, getIssue as libGetIssue, type Issue, listIssues as libListIssues } from "linear-cli/lib";
import { LINEAR_PROFILE } from "./config";

export { graphql } from "linear-cli/lib";
export type { Issue } from "linear-cli/lib";

export function listIssues(projectName: string): Promise<Issue[]> {
  return libListIssues({ projects: [projectName], limit: 50, profile: LINEAR_PROFILE });
}

// issue の description と全コメント本文 (repo: 明示の探索用)。
export async function issueTexts(identifier: string): Promise<(string | null | undefined)[]> {
  const issue = await libGetIssue(identifier, { profile: LINEAR_PROFILE });
  const texts: (string | null | undefined)[] = [issue.description];
  for (const c of issue.comments?.nodes ?? []) {
    texts.push(c.body);
  }
  return texts;
}

// success=false は lib 側が throw する。
export function createIssue(i: { title: string; team: string; project: string; description: string }): Promise<Issue> {
  return libCreateIssue({ ...i, profile: LINEAR_PROFILE });
}
