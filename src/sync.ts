// symphony sync 本体 (単体バイナリ `~/.local/bin/symphony/sync`、末尾の import.meta.main が
// エントリ): `symphony` ラベル × Backlog を走査し、repo 名を解決できれば追跡を開始
// (startTracking)、できなければ `リポジトリ名の確定` issue 起票 + offTrack の project update を出す。
// 決定的処理のみ (初期 issue の要否など判断は loop = LOOP.md)。--dry-run で書き込みを抑止。
// 追跡開始の実処理は start-tracking.ts (単体バイナリ symphony/start-tracking と共用)。

import { DIRTY_ISSUE_TITLE, DRY, ISSUE_LIMIT, LABEL, LINEAR_PROFILE, OWNER, STALE_DAYS, TARGET_STATUS } from "./lib/config";
import { createIssue, graphql, type Issue, listIssues } from "./lib/linear";
import { log } from "./lib/log";
import { resolveRepo, teamOf } from "./lib/repo-resolve";
import type { LinearProject } from "./lib/types";
import { postProjectUpdate, resolveInProgressStatusId, startTracking } from "./start-tracking";

async function listSymphonyProjects(label: string, status: string): Promise<LinearProject[]> {
  const data = await graphql<{ projects: { nodes: LinearProject[] } }>(
    `query($label: String!, $status: String!) {
       projects(filter:{ labels:{ name:{ eq:$label } }, status:{ name:{ eq:$status } } }) {
         nodes { id name slugId content description teams(first:1){ nodes { key } } }
       }
     }`,
    { profile: LINEAR_PROFILE, variables: { label, status } },
  );
  return data.projects.nodes;
}

// issue を冪等に用意し、その issue (既存 or 新規) を返す。DRY で未作成なら null。
async function ensureIssue(proj: LinearProject, title: string, body: string): Promise<Issue | null> {
  const name = proj.name;
  const found = (await listIssues(name)).find((i) => i.title === title);
  if (found) {
    log(`  issue '${title}' already exists in '${name}' — skip`);
    return found;
  }
  if (DRY) {
    log(`  [dry] would create issue '${title}' in '${name}'`);
    return null;
  }
  const created = await createIssue({ title, team: teamOf(proj), project: name, description: body });
  log(`  created issue '${title}' in '${name}'`);
  return created;
}

async function ensureDirtyIssue(proj: LinearProject): Promise<Issue | null> {
  const body =
    `プロジェクト名 \`${proj.name}\` に \`[A-Za-z0-9 _-]\` 以外の文字が含まれるため、` +
    "リポジトリ名を自動決定できませんでした。\n\n" +
    "この issue に `repo: <owner>/<name>` (owner 省略時は " +
    `\`${OWNER}\`) の1行をコメント（または説明に追記）して確定してください。\n` +
    "確定後、次回の symphony/sync 実行時に自動でリポジトリが作成されます。";
  return ensureIssue(proj, DIRTY_ISSUE_TITLE, body);
}

const DIRTY_UPDATE_MARKER = "まずはリポジトリ名を決めてください";

// repo 未確定を offTrack の project update で示す (確定 issue へのリンク付き、冪等)。
async function postDirtyUpdate(proj: LinearProject, issue: Issue | null): Promise<void> {
  if (DRY) {
    log("  [dry] would post offTrack update (decide repo name)");
    return;
  }
  if (!issue) {
    return;
  }
  const body = `⚠️ ${DIRTY_UPDATE_MARKER}（${issue.url ?? ""}）。`;
  await postProjectUpdate(proj.id, body, "offTrack", DIRTY_UPDATE_MARKER);
}

export async function processProject(proj: LinearProject, inProgressStatusId: string): Promise<void> {
  const repoFull = await resolveRepo(proj);
  if (repoFull === null) {
    log(`'${proj.name}': repo 未確定 -> リポジトリ名の確定 issue + offTrack update`);
    const issue = await ensureDirtyIssue(proj);
    await postDirtyUpdate(proj, issue);
    return;
  }
  await startTracking(proj, repoFull, inProgressStatusId);
}

interface OpenIssueComment {
  createdAt: string;
  user?: { id: string } | null;
  botActor?: { id: string } | null;
}

interface OpenIssue {
  identifier: string;
  title: string;
  state: { name: string };
  project: LinearProject;
  comments: { nodes: OpenIssueComment[] };
}

// 追跡中 (symphony × In Progress) のプロジェクト横断で Backlog / In Progress / In Review の
// issue を updatedAt 降順に最大 first 件、**1クエリ** で抜き出す。repo 名解決用の project
// フィールド、最終コメント判定用の comments、自分 (agent) の identity 用の viewer も同梱する
// (projects → issues → comments の3段ネストは complexity 上限を超えるので issue を頂点に)。
// comments は `first:2, orderBy:createdAt` (降順=最新が先頭。`last:N` は並びが createdAt でなく
// 最新を末尾 N 件に含めず取りこぼすため使わない)。
async function fetchTracked(label: string, first: number): Promise<{ viewerId: string; issues: OpenIssue[] }> {
  const data = await graphql<{ viewer: { id: string }; issues: { nodes: OpenIssue[] } }>(
    `query($label: String!, $first: Int!) {
       viewer { id }
       issues(filter: {
         project: { labels: { name: { eq: $label } }, status: { name: { eq: "In Progress" } } },
         state: { name: { in: ["Backlog", "In Progress", "In Review"] } }
       }, first: $first, orderBy: updatedAt) {
         nodes {
           identifier title
           state { name }
           project { id name slugId content description teams(first:1){ nodes { key } } }
           comments(first: 2, orderBy: createdAt) { nodes { createdAt user { id } botActor { id } } }
         }
       }
     }`,
    { profile: LINEAR_PROFILE, variables: { label, first } },
  );
  return { viewerId: data.viewer.id, issues: data.issues.nodes };
}

// 最終コメントの投稿者種別と時刻。null はコメント無し。並びは createdAt 降順なので先頭が最新
// だが、念のため createdAt 最大を採る。自分の判定は固定名でなく viewer.id との一致で行う
// (bot 経由 = botActor 有りも自分側扱い)。
function latestComment(issue: OpenIssue, viewerId: string): { byUser: boolean; createdAt: string } | null {
  const nodes = issue.comments?.nodes ?? [];
  if (nodes.length === 0) {
    return null;
  }
  let latest = nodes[0]!;
  for (const c of nodes) {
    if (c.createdAt > latest.createdAt) {
      latest = c;
    }
  }
  const byUser = !latest.botActor && latest.user?.id != null && latest.user.id !== viewerId;
  return { byUser, createdAt: latest.createdAt };
}

function preview(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// 最終出力 (stdout): 要対応の issue だけを追跡プロジェクト単位で並べる。要対応とは
//   - 最終コメントが user (＝返信待ち)、または
//   - 最終コメントが agent (自分) だが STALE_DAYS 日を超えて音沙汰なし (＝停滞、`(stale Nd)` 付き)。
// それ以外 (自分が最近対応済み / コメント無し) は出さない。要対応が無ければその旨1行のみ。
async function printTrackedSummary(): Promise<void> {
  console.log("");
  const { viewerId, issues } = await fetchTracked(LABEL, ISSUE_LIMIT);
  const now = Date.now();
  const staleMs = STALE_DAYS > 0 ? STALE_DAYS * 86_400_000 : null;

  // stale は agent 最終コメントの経過日数 (数値)、返信待ちは null。要対応でなければ undefined。
  const attention = (issue: OpenIssue): number | null | undefined => {
    const lc = latestComment(issue, viewerId);
    if (!lc) return undefined;
    if (lc.byUser) return null;
    if (staleMs === null) return undefined;
    const ageMs = now - Date.parse(lc.createdAt);
    return ageMs > staleMs ? Math.floor(ageMs / 86_400_000) : undefined;
  };

  const byProject = new Map<string, { project: LinearProject; items: { issue: OpenIssue; staleDays: number | null }[] }>();
  for (const issue of issues) {
    const staleDays = attention(issue);
    if (staleDays === undefined) {
      continue;
    }
    const entry = byProject.get(issue.project.id) ?? { project: issue.project, items: [] };
    entry.items.push({ issue, staleDays });
    byProject.set(issue.project.id, entry);
  }
  if (byProject.size === 0) {
    console.log("No issues awaiting your reply.");
    return;
  }
  for (const { project, items } of byProject.values()) {
    const repoFull = await resolveRepo(project);
    console.log(`${project.name}  (${repoFull ?? "repo unresolved"})`);
    for (const { issue, staleDays } of items) {
      const tag = staleDays === null ? "" : `  (stale ${staleDays}d)`;
      console.log(`  [${issue.state.name}] ${issue.identifier}  ${preview(issue.title, 80)}${tag}`);
    }
  }
}

export async function runSymphonySync(): Promise<void> {
  const inProgressStatusId = await resolveInProgressStatusId();
  const projects = await listSymphonyProjects(LABEL, TARGET_STATUS);
  for (const proj of projects) {
    await processProject(proj, inProgressStatusId);
  }
  await printTrackedSummary();
}

// 単体バイナリ (~/.local/bin/symphony/sync) として直接起動されたときのみ実行する。失敗は
// stderr + exit 1 (fail-loud)。設定解決 (owner / profile) は import 時に throw し得る。
if (import.meta.main) {
  try {
    await runSymphonySync();
  } catch (err) {
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exit(1);
  }
}
