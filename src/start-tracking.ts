// repo 名が確定したプロジェクトの追跡開始処理: repo 作成 → onTrack な追跡開始 update →
// In Progress 化。sync (sync.ts) が Backlog 走査中に repo 確定を見つけたとき import して使うほか、
// このファイル自体が単体バイナリ `~/.local/bin/symphony/start-tracking <project> <repo>` として
// ビルドされ、Claude が repo 名確定後に直接叩く (末尾の import.meta.main を参照)。

import { existsSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import agentsTemplate from "../templates/AGENTS.md" with { type: "text" };
import { DRY, LINEAR_PROFILE } from "./lib/config";
import { graphql } from "./lib/linear";
import { log } from "./lib/log";
import { normalizeRepo } from "./lib/repo-resolve";
import { run } from "./lib/subprocess";
import type { LinearProject } from "./lib/types";

type Health = "onTrack" | "atRisk" | "offTrack";

// In Progress の status id はワークスペース固有なので id をハードコードせず動的解決する。
export async function resolveInProgressStatusId(): Promise<string> {
  const data = await graphql<{ organization: { projectStatuses: { id: string; name: string }[] } }>(
    "query { organization { projectStatuses { id name } } }",
    { profile: LINEAR_PROFILE },
  );
  const status = data.organization.projectStatuses.find((s) => s.name === "In Progress");
  if (!status) {
    throw new Error("could not resolve project status 'In Progress' from organization.projectStatuses");
  }
  return status.id;
}

// ghq の primary root。ghq に解決させる (GHQ_ROOT / git config ghq.root / 既定)。ghq は
// 最小環境 (launchd 等) でハングし得るが、ループは対話 / フル環境でしか回さない前提。
function ghqRoot(): string {
  const r = run(["ghq", "root"]);
  if (r.exitCode !== 0) {
    throw new Error(`ghq root failed (exit ${r.exitCode}): ${r.stderr.trim()}`);
  }
  const root = r.stdout.split("\n")[0]!.trim();
  if (!root) {
    throw new Error("ghq root returned empty");
  }
  return root;
}

// <ghq root>/github.com/<owner>/<name> を ghq create で作り (mkdir + git init)、jj を colocate、
// AGENTS.md (+ CLAUDE.md symlink)・.linear-cli.json を生成する (冪等)。AGENTS.md テンプレは
// バイナリに埋め込むので外部配置は不要。
function setupProject(repoFull: string, projectName: string): string {
  if (!repoFull.includes("/")) {
    throw new Error(`repo は <owner>/<name> 形式で指定してください (指定値: ${repoFull})`);
  }
  const repoPath = join(ghqRoot(), "github.com", repoFull);

  // ghq create は既存かつ非空の dir で error になるので、.git が無いときだけ呼ぶ。
  if (!existsSync(join(repoPath, ".git"))) {
    const r = run(["ghq", "create", repoFull]);
    if (r.exitCode !== 0) {
      throw new Error(`ghq create ${repoFull} failed (exit ${r.exitCode}): ${r.stderr.trim()}`);
    }
  }

  if (!existsSync(join(repoPath, ".jj"))) {
    const r = run(["jj", "git", "init", "--colocate"], { cwd: repoPath });
    if (r.exitCode !== 0) {
      throw new Error(`jj git init --colocate in ${repoPath} failed (exit ${r.exitCode}): ${r.stderr.trim()}`);
    }
  }

  if (!existsSync(join(repoPath, "AGENTS.md"))) {
    writeFileSync(join(repoPath, "AGENTS.md"), agentsTemplate.replaceAll("{{PROJECT_NAME}}", projectName));
  }

  // CLAUDE.md しか読まないツールにも AGENTS.md を見せるため、the-symphony root と同じく
  // CLAUDE.md を AGENTS.md への相対 symlink にする (既に何かあれば触らない)。
  if (!existsSync(join(repoPath, "CLAUDE.md"))) {
    symlinkSync("AGENTS.md", join(repoPath, "CLAUDE.md"));
  }

  // subagent が repo 内で `linear ...` を --project/--profile 無しで叩けるよう束縛を書く。
  // profile は書かず既定に委ねる (.linear-cli.json は gitignore 済み)。
  if (!existsSync(join(repoPath, ".linear-cli.json"))) {
    writeFileSync(join(repoPath, ".linear-cli.json"), JSON.stringify({ projects: [projectName] }, null, 2) + "\n");
  }

  return repoPath;
}

// project update を health 付きで投稿する。marker が既存 update の本文にあれば冪等スキップ
// (再実行・中断後の二重投稿を防ぐ)。sync の offTrack 通知と追跡開始の onTrack 通知が共用する。
export async function postProjectUpdate(projectId: string, body: string, health: Health, marker: string): Promise<void> {
  // orderBy:createdAt は降順 (最新が先頭) なので、更新が 30 件を超えても直近の marker 付き
  // update を確実に取れる。無指定だと Linear は古い順で返し、最新の marker を取りこぼす。
  const existing = await graphql<{ project?: { projectUpdates?: { nodes?: { body?: string | null }[] } } }>(
    "query($id: String!){ project(id:$id){ projectUpdates(first:30, orderBy:createdAt){ nodes { body } } } }",
    { profile: LINEAR_PROFILE, variables: { id: projectId } },
  );
  const nodes = existing?.project?.projectUpdates?.nodes ?? [];
  if (nodes.some((n) => typeof n.body === "string" && n.body.includes(marker))) {
    log(`  project update ('${marker}') already exists — skip`);
    return;
  }
  const res = await graphql<{ projectUpdateCreate?: { success?: boolean } }>(
    "mutation($projectId: String!, $body: String!, $health: ProjectUpdateHealthType!) {" +
      " projectUpdateCreate(input:{projectId:$projectId, body:$body, health:$health})" +
      " { success projectUpdate { url } } }",
    { profile: LINEAR_PROFILE, variables: { projectId, body, health } },
  );
  if (!res?.projectUpdateCreate?.success) {
    throw new Error(`project update not confirmed: ${JSON.stringify(res)}`);
  }
  log(`  posted project update (${health})`);
}

async function setProjectInProgress(projectId: string, inProgressStatusId: string): Promise<void> {
  const res = await graphql<{ projectUpdate?: { success?: boolean } }>(
    "mutation($id: String!, $statusId: String!) {" + " projectUpdate(id:$id, input:{statusId:$statusId}) { success } }",
    { profile: LINEAR_PROFILE, variables: { id: projectId, statusId: inProgressStatusId } },
  );
  if (!res?.projectUpdate?.success) {
    throw new Error(`status change not confirmed: ${JSON.stringify(res)}`);
  }
  log("  set project status -> In Progress");
}

const TRACKING_UPDATE_MARKER = "Symphony による追跡を開始";

// repo 確定済みプロジェクトの追跡を開始する (repo 作成 → onTrack update → In Progress)。
// repoFull (<owner>/<repo>) は呼び出し側が確定させて渡す (sync は resolveRepo 済み、bin は
// 引数)。inProgressStatusId 未指定なら解決する。渡された repoFull をそのまま返す。
export async function startTracking(proj: LinearProject, repoFull: string, inProgressStatusId?: string): Promise<string> {
  log(`'${proj.name}': -> ${repoFull}`);
  if (DRY) {
    log("  [dry] would set up repo, post onTrack update & set status -> In Progress");
    return repoFull;
  }
  const repoPath = setupProject(repoFull, proj.name);
  log(`  ensured ${repoFull} (${repoPath})`);
  await postProjectUpdate(proj.id, `🎼 ${TRACKING_UPDATE_MARKER}しました（repo: \`${repoFull}\`）。`, "onTrack", TRACKING_UPDATE_MARKER);
  await setProjectInProgress(proj.id, inProgressStatusId ?? (await resolveInProgressStatusId()));
  return repoFull;
}

// 直接呼び出し (~/.local/bin/symphony/start-tracking <project> <repo>) 用。project 名で
// Linear プロジェクトを引き、repo (owner 省略可) を確定させて startTracking し、`<owner>/<repo>`
// を返す。repo 未確定なら sync ではなくここに渡すべき値が無い＝呼び出し側の責務。
export async function runStartTracking(argv: string[]): Promise<string> {
  const [name, repoArg] = argv.filter((a) => !a.startsWith("-"));
  if (!name || !repoArg) {
    throw new Error("Usage: start-tracking <project name> <repo name> [--dry-run]");
  }
  const data = await graphql<{ projects: { nodes: LinearProject[] } }>(
    "query($name: String!) { projects(filter:{ name:{ eq:$name } }, first:1){" +
      " nodes { id name slugId content description teams(first:1){ nodes { key } } } } }",
    { profile: LINEAR_PROFILE, variables: { name } },
  );
  const proj = data.projects.nodes[0];
  if (!proj) {
    throw new Error(`project not found: '${name}'`);
  }
  return startTracking(proj, normalizeRepo(repoArg));
}

// 単体バイナリ (~/.local/bin/symphony/start-tracking) として直接起動されたときのみ実行する。
// sync が import したときは import.meta.main が false なので走らない。解決した
// <owner>/<repo> を stdout に、進捗は stderr に。失敗は stderr + exit 1 (fail-loud)。
if (import.meta.main) {
  try {
    console.log(await runStartTracking(process.argv.slice(2)));
  } catch (err) {
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exit(1);
  }
}
