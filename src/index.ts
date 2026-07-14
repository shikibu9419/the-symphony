#!/usr/bin/env bun
// symphony-setup — Linear の symphony ラベル & Backlog のプロジェクトを走査し、
// リポジトリを作成 / 追跡する。`bun build --compile` で単一バイナリ化して運用する。
//
// Linear へのアクセスは全て `linear` CLI (linear-cli) 経由のサブプロセス起動で行う。
// リモート(GitHub)連携・push・並行実行ロックは実装しない。
//
// DRY_RUN=1 で副作用なしの確認実行。

import { DRY, LABEL, TARGET_STATUS } from "./constants";
import { linearGraphql } from "./linear-cli";
import { log } from "./log";
import { processProject } from "./sync";
import type { LinearProject } from "./types";

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

  for (const proj of projects) {
    processProject(proj, orgUrlKey, inProgressStatusId);
  }
}

main();
