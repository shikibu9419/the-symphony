/**
 * `linear comment <list|create>`
 *
 * list   : comments on an issue (identifier or UUID), oldest-first.
 * create : add a markdown comment to an issue (create logic lives in `../lib`).
 */

import { parseArgs } from "node:util";
import { graphql } from "../client";
import { createComment } from "../lib";
import { printJson, fail } from "../output";
import { resolveIssue } from "../linear-helpers";
import { readStdin } from "../auth-store";

async function cmdList(rest: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: { "api-key": { type: "string" }, limit: { type: "string" }, json: { type: "boolean", default: true } },
  });
  const id = positionals[0];
  if (!id) fail("Usage: linear comment list <issueID|identifier>");
  const apiKey = values["api-key"] as string | undefined;
  const first = values.limit ? Math.max(1, Number(values.limit)) : 100;

  const ref = await resolveIssue(id!, { apiKey });
  const data = await graphql<{
    issue: { comments: { nodes: Array<unknown> } };
  }>(
    `query($id: String!, $first: Int!) {
       issue(id: $id) {
         comments(first: $first) {
           nodes { id body createdAt updatedAt user { name email } }
         }
       }
     }`,
    { apiKey, variables: { id: ref.id, first } },
  );
  printJson({
    ok: true,
    issue: { id: ref.id, identifier: ref.identifier, title: ref.title },
    count: data.issue.comments.nodes.length,
    comments: data.issue.comments.nodes,
  });
}

async function cmdCreate(rest: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: { body: { type: "string" }, "api-key": { type: "string" } },
  });
  const id = positionals[0];
  if (!id) fail("Usage: linear comment create <issueID|identifier> --body <md>");
  const apiKey = values["api-key"] as string | undefined;

  let body = values.body as string | undefined;
  if (body === undefined || body === "-") {
    body = (await readStdin()).trim();
  }
  if (!body) fail("Comment body is empty. Pass --body <md> or pipe it via stdin.");

  // Resolve the ref up front so the output can echo the issue identifier, then
  // create against the resolved UUID.
  const ref = await resolveIssue(id!, { apiKey });
  const comment = await createComment(ref.id, body, { apiKey });
  printJson({
    ok: true,
    issue: { id: ref.id, identifier: ref.identifier },
    comment,
  });
}

export async function runComment(argv: string[]): Promise<void> {
  const sub = argv[0];
  const rest = argv.slice(1);
  switch (sub) {
    case "list":
      return cmdList(rest);
    case "create":
      return cmdCreate(rest);
    default:
      fail(`Unknown comment subcommand: ${sub ?? "(none)"}. Use list|create.`);
  }
}
