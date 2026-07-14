// Linear プロジェクトから repo フルネーム (owner/name) と team を解決する。

import { CLEAN_RE, DIRTY_ISSUE_TITLE, OWNER, REPO_DIRECTIVE_RE } from "./config";
import { issueTexts, listIssues } from "./linear";
import type { LinearProject } from "./types";

function slugify(name: string): string {
  const s = name.trim().toLowerCase().replace(/\s+/g, "-");
  return s.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}

// owner 省略 (`/` 無し) なら OWNER を前置する。`repo:` 明示と start-tracking の repo 引数で共用。
export function normalizeRepo(value: string): string {
  return value.includes("/") ? value : `${OWNER}/${value}`;
}

function findDirective(...texts: (string | null | undefined)[]): string | null {
  for (const t of texts) {
    if (t) {
      const m = REPO_DIRECTIVE_RE.exec(t);
      if (m) {
        return normalizeRepo(m[1]!);
      }
    }
  }
  return null;
}

/** 「リポジトリ名の確定」issue の説明 or コメントに書かれた repo: 明示を読む。 */
async function confirmedRepoFromIssue(projectName: string): Promise<string | null> {
  for (const i of await listIssues(projectName)) {
    if (i.title === DIRTY_ISSUE_TITLE) {
      return findDirective(...(await issueTexts(i.identifier)));
    }
  }
  return null;
}

/**
 * repo フルネーム (owner/name) を返す。確定できなければ null。
 *
 * 優先順位: content の repo: 明示 > 「リポジトリ名の確定」issue の repo: 明示 > slug。
 * issue チェックを slug より前に置くのは意図的で、clean 名のプロジェクトでも issue に
 * `repo:` を書けば slug を上書きできるようにするため (この順序を入れ替えると上書きが効かなくなる)。
 */
export async function resolveRepo(proj: LinearProject): Promise<string | null> {
  const fromContent = findDirective(proj.content, proj.description);
  if (fromContent) {
    return fromContent;
  }
  const fromIssue = await confirmedRepoFromIssue(proj.name);
  if (fromIssue) {
    return fromIssue;
  }
  if (CLEAN_RE.test(proj.name)) {
    return `${OWNER}/${slugify(proj.name)}`;
  }
  return null;
}

export function teamOf(proj: LinearProject): string {
  const key = proj.teams?.nodes?.[0]?.key;
  if (!key) {
    throw new Error(`プロジェクト '${proj.name}' に team が無く issue を作成できません。`);
  }
  return key;
}
