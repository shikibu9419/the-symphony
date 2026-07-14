/**
 * `linear issue <list|get|create|update>`
 *
 * Thin, opinionated wrappers over the GraphQL API. Everything is JSON out.
 * The list/get/create middle logic lives in `../lib`; these commands parse
 * argv, resolve the per-repo project binding, call the lib, and print JSON.
 * For anything not covered here, use `linear graphql`.
 */

import { parseArgs } from "node:util";
import { graphql } from "../client";
import { createIssue, getIssue, ISSUE_FIELDS, listIssues } from "../lib";
import { printJson, fail } from "../output";
import { resolveIssue, resolveProjectId, resolveStateId } from "../linear-helpers";
import { findRepoConfig } from "../repo-config";

async function cmdList(rest: string[]): Promise<void> {
  const { values } = parseArgs({
    args: rest,
    options: {
      project: { type: "string", multiple: true },
      state: { type: "string" },
      team: { type: "string" },
      assignee: { type: "string" },
      limit: { type: "string" },
      "all-projects": { type: "boolean", default: false },
      "api-key": { type: "string" },
      json: { type: "boolean", default: true },
    },
  });
  const apiKey = values["api-key"] as string | undefined;

  // Projects: explicit --project wins; otherwise fall back to the repo binding.
  // --all-projects bypasses the binding entirely.
  const cliProjects = (values.project as string[] | undefined) ?? [];
  const boundProjects = values["all-projects"] ? [] : findRepoConfig().projects;
  const projects = cliProjects.length > 0 ? cliProjects : boundProjects;

  const issues = await listIssues({
    projects,
    state: values.state as string | undefined,
    team: values.team as string | undefined,
    assignee: values.assignee as string | undefined,
    limit: values.limit ? Number(values.limit) : undefined,
    apiKey,
  });
  printJson({ ok: true, count: issues.length, projects_filter: projects, issues });
}

async function cmdGet(rest: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: { "api-key": { type: "string" }, json: { type: "boolean", default: true } },
  });
  const id = positionals[0];
  if (!id) fail("Usage: linear issue get <ID|identifier>");
  const apiKey = values["api-key"] as string | undefined;

  const issue = await getIssue(id!, { apiKey });
  printJson({ ok: true, issue });
}

async function cmdCreate(rest: string[]): Promise<void> {
  const { values } = parseArgs({
    args: rest,
    options: {
      title: { type: "string" },
      description: { type: "string" },
      team: { type: "string" },
      project: { type: "string" },
      state: { type: "string" },
      "api-key": { type: "string" },
    },
  });
  const apiKey = values["api-key"] as string | undefined;
  if (!values.title) fail("--title is required");
  if (!values.team) fail("--team is required (team key or name)");

  const issue = await createIssue({
    title: values.title as string,
    team: values.team as string,
    description: values.description as string | undefined,
    project: values.project as string | undefined,
    state: values.state as string | undefined,
    apiKey,
  });
  printJson({ ok: true, issue });
}

async function cmdUpdate(rest: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      state: { type: "string" },
      title: { type: "string" },
      description: { type: "string" },
      project: { type: "string" },
      "api-key": { type: "string" },
    },
  });
  const id = positionals[0];
  if (!id) fail("Usage: linear issue update <ID|identifier> --state <state>");
  const apiKey = values["api-key"] as string | undefined;

  const ref = await resolveIssue(id!, { apiKey });
  const input: Record<string, unknown> = {};
  if (values.state) input.stateId = await resolveStateId(ref.teamId, values.state as string, { apiKey });
  if (values.title) input.title = values.title;
  if (values.description) input.description = values.description;
  if (values.project) input.projectId = await resolveProjectId(values.project as string, { apiKey });
  if (Object.keys(input).length === 0) fail("Nothing to update. Pass --state / --title / --description / --project.");

  const data = await graphql<{ issueUpdate: { success: boolean; issue: unknown } }>(
    `mutation($id: String!, $input: IssueUpdateInput!) {
       issueUpdate(id: $id, input: $input) {
         success
         issue { ${ISSUE_FIELDS} }
       }
     }`,
    { apiKey, variables: { id: ref.id, input } },
  );
  printJson({ ok: data.issueUpdate.success, issue: data.issueUpdate.issue });
}

export async function runIssue(argv: string[]): Promise<void> {
  const sub = argv[0];
  const rest = argv.slice(1);
  switch (sub) {
    case "list":
      return cmdList(rest);
    case "get":
      return cmdGet(rest);
    case "create":
      return cmdCreate(rest);
    case "update":
      return cmdUpdate(rest);
    default:
      fail(`Unknown issue subcommand: ${sub ?? "(none)"}. Use list|get|create|update.`);
  }
}
