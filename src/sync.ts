// issue の冪等作成 / project update 投稿 / status 変更 / CLAUDE.md 生成 /
// リポジトリ作成 / プロジェクト処理。

import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DESIGN_ISSUE_TITLE, DIRTY_ISSUE_TITLE, DRY, OWNER } from "./constants";
import { issueCreate, linearGraphql, listIssues, run } from "./linear-cli";
import { log } from "./log";
import { resolveRepo, teamOf } from "./repo-resolve";
import { TEMPLATE } from "./template";
import type { LinearProject } from "./types";

function ensureIssue(proj: LinearProject, title: string, body: string): void {
  const name = proj.name;
  if (listIssues(name).some((i) => i.title === title)) {
    log(`  issue '${title}' already exists in '${name}' — skip`);
    return;
  }
  if (DRY) {
    log(`  [dry] would create issue '${title}' in '${name}'`);
    return;
  }
  const r = issueCreate(title, teamOf(proj), name, body);
  if (r.exitCode !== 0) {
    throw new Error(`failed to create issue '${title}' in '${name}' (exit ${r.exitCode}): ${r.stderr.trim()}`);
  }
  log(`  created issue '${title}' in '${name}'`);
}

function ensureDirtyIssue(proj: LinearProject): void {
  const body =
    `プロジェクト名 \`${proj.name}\` に \`[A-Za-z0-9 _-]\` 以外の文字が含まれるため、` +
    "リポジトリ名を自動決定できませんでした。\n\n" +
    "この issue に `repo: <owner>/<name>` (owner 省略時は " +
    `\`${OWNER}\`) の1行をコメント（または説明に追記）して確定してください。\n` +
    "確定後、次回の linear-repo-sync 実行時に自動でリポジトリが作成されます。";
  ensureIssue(proj, DIRTY_ISSUE_TITLE, body);
}

function ensureDesignIssue(proj: LinearProject, repoFull: string): void {
  const body =
    `リポジトリ \`${repoFull}\` の追跡を開始しました。実装着手の前に、このプロジェクトの` +
    "設計方針を確定します。\n\n" +
    "- スコープ / ゴールの明確化\n" +
    "- アーキテクチャと主要な技術選定\n" +
    "- 最初のマイルストーンと分解した issue\n\n" +
    "これらがまとまり次第、実装へ進みます。";
  ensureIssue(proj, DESIGN_ISSUE_TITLE, body);
}

const TRACKING_UPDATE_MARKER = "Symphony による追跡を開始";

function postProjectUpdate(projectId: string, repoFull: string): void {
  const body = `🎼 ${TRACKING_UPDATE_MARKER}しました（repo: \`${repoFull}\`）。`;
  if (DRY) {
    log(`  [dry] would post project update: ${body}`);
    return;
  }
  // 冪等性: finalize が status 変更前に中断して再実行されても追跡開始 update を
  // 二重投稿しないよう、既存の update に marker があればスキップする。
  const existing = linearGraphql<{ project?: { projectUpdates?: { nodes?: { body?: string | null }[] } } }>(
    "query($id: String!){ project(id:$id){ projectUpdates(first:30){ nodes { body } } } }",
    { id: projectId },
  );
  const nodes = existing?.project?.projectUpdates?.nodes ?? [];
  if (nodes.some((n) => typeof n.body === "string" && n.body.includes(TRACKING_UPDATE_MARKER))) {
    log("  tracking-start project update already exists — skip");
    return;
  }
  const q =
    "mutation($projectId: String!, $body: String!) {" +
    " projectUpdateCreate(input:{projectId:$projectId, body:$body})" +
    " { success projectUpdate { url } } }";
  const res = linearGraphql<{ projectUpdateCreate?: { success?: boolean } }>(q, { projectId, body });
  if (!res?.projectUpdateCreate?.success) {
    throw new Error(`project update not confirmed: ${JSON.stringify(res)}`);
  }
  log("  posted tracking-start project update");
}

function setProjectInProgress(projectId: string, inProgressStatusId: string): void {
  if (DRY) {
    log("  [dry] would set project status -> In Progress");
    return;
  }
  const q = "mutation($id: String!, $statusId: String!) {" + " projectUpdate(id:$id, input:{statusId:$statusId}) { success } }";
  const res = linearGraphql<{ projectUpdate?: { success?: boolean } }>(q, { id: projectId, statusId: inProgressStatusId });
  if (!res?.projectUpdate?.success) {
    throw new Error(`status change not confirmed: ${JSON.stringify(res)}`);
  }
  log("  set project status -> In Progress");
}

function writeClaudeMd(path: string, proj: LinearProject, orgUrlKey: string): void {
  const subs: Record<string, string> = {
    "{{PROJECT_NAME}}": proj.name,
    "{{PROJECT_ID}}": proj.id,
    "{{PROJECT_SLUG_ID}}": proj.slugId ?? "",
    "{{TEAM_KEY}}": teamOf(proj),
    "{{ORG_URLKEY}}": orgUrlKey,
  };
  let content = TEMPLATE;
  for (const [k, v] of Object.entries(subs)) {
    content = content.split(k).join(v);
  }
  writeFileSync(join(path, "CLAUDE.md"), content);
}

function createRepo(repoFull: string, path: string, proj: LinearProject, orgUrlKey: string): void {
  if (DRY) {
    log(`  [dry] would create ${path} + git init + jj git init --colocate + CLAUDE.md`);
    return;
  }
  // ghq create は「<ghq root>/github.com/<owner>/<name> を作って git init」と等価。
  // ghq バイナリは launchd 実行コンテキストで固まる（git 子プロセスを起こす前に
  // pthread_cond_wait でハング）ため、ghq に依存せずネイティブに再現する。
  mkdirSync(path, { recursive: true });
  const r = run(["git", "init", path]);
  if (r.exitCode !== 0) {
    throw new Error(`git init ${repoFull} failed (exit ${r.exitCode}): ${r.stderr.trim()}`);
  }
  const r2 = run(["jj", "git", "init", "--colocate"], { cwd: path });
  if (r2.exitCode !== 0) {
    throw new Error(`jj git init --colocate ${repoFull} failed (exit ${r2.exitCode}): ${r2.stderr.trim()}`);
  }
  writeClaudeMd(path, proj, orgUrlKey);
  log(`  created ${repoFull}`);
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch (e) {
    // 「存在しない」だけを false とし、権限エラー等は握りつぶさず投げる。
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw e;
  }
}

export function processProject(proj: LinearProject, root: string, orgUrlKey: string, inProgressStatusId: string): void {
  const name = proj.name;
  const repoFull = resolveRepo(proj);
  if (repoFull === null) {
    log(`'${name}': repo 未確定 -> リポジトリ名の確定 issue のみ`);
    ensureDirtyIssue(proj);
    return;
  }
  const path = join(root, "github.com", repoFull);
  if (isDir(path)) {
    log(`'${name}': -> ${repoFull} (既存パス, 作成スキップ)`);
  } else {
    log(`'${name}': -> ${repoFull} (新規作成)`);
    createRepo(repoFull, path, proj, orgUrlKey);
  }
  ensureDesignIssue(proj, repoFull);
  postProjectUpdate(proj.id, repoFull);
  setProjectInProgress(proj.id, inProgressStatusId);
}
