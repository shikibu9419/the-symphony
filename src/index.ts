#!/usr/bin/env bun
// linear-repo-sync — Linear の "symphony" ラベル & Backlog のプロジェクトを走査し、
// リポジトリを作成 / 追跡する。`bun build --compile` で単一バイナリ化して運用する。
//
// Linear へのアクセスは全て `linear` CLI (linear-cli) 経由のサブプロセス起動で行う。
// リモート(GitHub)連携・push・並行実行ロックは実装しない。
//
// DRY_RUN=1 で副作用なしの確認実行。

import { homedir } from "node:os";
import { DRY, LABEL, TARGET_STATUS } from "./constants";
import { linearGraphql, run } from "./linear-cli";
import { log } from "./log";
import { processProject } from "./sync";
import type { LinearProject } from "./types";

// ghq root を ghq バイナリを起動せずに解決する。ghq は launchd 実行コンテキストで
// ハングするため依存しない。ghq のroot解決規則に倣い GHQ_ROOT → git config ghq.root
// → ~/ghq の順で決める。先頭の ~ は HOME に展開する。
function ghqRoot(): string {
  const expand = (p: string): string =>
    p.startsWith("~/") || p === "~" ? p.replace(/^~/, homedir()) : p;
  const env = process.env.GHQ_ROOT;
  if (env && env.trim()) return expand(env.trim().split(":")[0]!);
  const cfg = run(["git", "config", "--get", "ghq.root"]);
  if (cfg.exitCode === 0 && cfg.stdout.trim()) return expand(cfg.stdout.trim().split("\n")[0]!);
  return `${homedir()}/ghq`;
}

interface OrgQueryResult {
  organization: {
    urlKey: string;
    projectStatuses: { id: string; name: string }[];
  };
}

interface ProjectsQueryResult {
  projects: { nodes: LinearProject[] };
}

function main(): void {
  // In Progress の status id はワークスペース固有の projectStatuses から動的に解決する
  // (固定 id のハードコードを避ける)。
  const orgData = linearGraphql<OrgQueryResult>("query { organization { urlKey projectStatuses { id name } } }");
  const orgUrlKey = orgData.organization.urlKey;
  const inProgressStatus = orgData.organization.projectStatuses.find((s) => s.name === "In Progress");
  if (!inProgressStatus) {
    log("FATAL: could not resolve project status 'In Progress' from organization.projectStatuses");
    process.exit(1);
  }
  const inProgressStatusId = inProgressStatus.id;

  const data = linearGraphql<ProjectsQueryResult>(
    'query { projects(filter:{ labels:{ name:{ eq:"' +
      LABEL +
      '" } },' +
      ' status:{ name:{ eq:"' +
      TARGET_STATUS +
      '" } } }){' +
      " nodes { id name slugId content description teams(first:1){nodes{key}} } } }",
  );
  const projects = data.projects.nodes;
  log(`${projects.length} project(s): label '${LABEL}' & status '${TARGET_STATUS}'` + (DRY ? " [DRY_RUN]" : ""));

  const root = ghqRoot();
  for (const proj of projects) {
    processProject(proj, root, orgUrlKey, inProgressStatusId);
  }
}

main();
