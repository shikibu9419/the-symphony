// issue の冪等作成 / project update 投稿 / status 変更 / repo 作成の呼び出し
// (機械処理は create-repo.sh に委譲) / プロジェクト処理。

import { CREATE_REPO_SH, DIRTY_ISSUE_TITLE, DRY, OWNER } from "./constants";
import { issueCreate, linearGraphql, listIssues, run } from "./linear-cli";
import { log } from "./log";
import { resolveRepo, teamOf } from "./repo-resolve";
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
    "確定後、次回の symphony-loop 実行時（冒頭の symphony-setup）に自動でリポジトリが作成されます。";
  ensureIssue(proj, DIRTY_ISSUE_TITLE, body);
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

function ensureRepo(repoFull: string, proj: LinearProject, orgUrlKey: string): void {
  if (DRY) {
    log(`  [dry] would run create-repo.sh for ${repoFull}`);
    return;
  }
  const r = run([CREATE_REPO_SH, repoFull], {
    env: {
      ...process.env,
      PROJECT_NAME: proj.name,
      PROJECT_ID: proj.id,
      PROJECT_SLUG_ID: proj.slugId ?? "",
      TEAM_KEY: teamOf(proj),
      ORG_URLKEY: orgUrlKey,
    },
  });
  if (r.exitCode !== 0) {
    throw new Error(`create-repo.sh ${repoFull} failed (exit ${r.exitCode}): ${r.stderr.trim()}`);
  }
  log(`  ensured ${repoFull} (${r.stdout.trim()})`);
}

export function processProject(proj: LinearProject, orgUrlKey: string, inProgressStatusId: string): void {
  const name = proj.name;
  const repoFull = resolveRepo(proj);
  if (repoFull === null) {
    log(`'${name}': repo 未確定 -> リポジトリ名の確定 issue のみ`);
    ensureDirtyIssue(proj);
    return;
  }
  log(`'${name}': -> ${repoFull}`);
  ensureRepo(repoFull, proj, orgUrlKey);
  postProjectUpdate(proj.id, repoFull);
  setProjectInProgress(proj.id, inProgressStatusId);
}
