// repo 名解決ロジック (slugify / normalize / directive 探索 / 確定 issue 読み取り /
// resolve / team 解決)。

import { CLEAN_RE, DIRTY_ISSUE_TITLE, OWNER, REPO_DIRECTIVE_RE, TEAM_FALLBACK } from "./constants";
import { issueTexts, listIssues } from "./linear-cli";
import type { LinearProject } from "./types";

export function slugify(name: string): string {
  const s = name.trim().toLowerCase().replace(/\s+/g, "-");
  return s.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}

export function normalizeRepo(value: string): string {
  return value.includes("/") ? value : `${OWNER}/${value}`;
}

export function findDirective(...texts: (string | null | undefined)[]): string | null {
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
export function confirmedRepoFromIssue(projectName: string): string | null {
  for (const i of listIssues(projectName)) {
    if (i.title === DIRTY_ISSUE_TITLE) {
      return findDirective(...issueTexts(i.identifier));
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
export function resolveRepo(proj: LinearProject): string | null {
  const fromContent = findDirective(proj.content, proj.description);
  if (fromContent) {
    return fromContent;
  }
  const fromIssue = confirmedRepoFromIssue(proj.name);
  if (fromIssue) {
    return fromIssue;
  }
  if (CLEAN_RE.test(proj.name)) {
    return `${OWNER}/${slugify(proj.name)}`;
  }
  return null;
}

export function teamOf(proj: LinearProject): string {
  const teams = proj.teams?.nodes ?? [];
  return teams[0]?.key ?? TEAM_FALLBACK;
}
