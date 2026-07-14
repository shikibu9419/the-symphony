/**
 * In-process surface for linear-cli: the same logic the `issue` / `comment`
 * commands run, as importable async functions (`import ... from "linear-cli/lib"`).
 * Fail-loud — GraphQL errors, not-found resolves, and `success:false` mutations
 * throw `LinearError` rather than returning an empty/null value.
 */

import { graphql, LinearError, type LinearOpts } from "./client";
import { resolveIssue, resolveProjectId, resolveStateId, resolveTeamId } from "./linear-helpers";

export { graphql, LinearError } from "./client";
export type { LinearOpts } from "./client";

/** Field set shared by list/get/create so their `issue` shape stays identical. */
export const ISSUE_FIELDS = `
  id identifier title url priority
  state { name type }
  project { name }
  assignee { name email }
  updatedAt createdAt`;

export interface IssueComment {
  id?: string;
  body?: string | null;
  createdAt?: string;
  user?: { name?: string | null } | null;
}

export interface Issue {
  id: string;
  identifier: string;
  title: string;
  url?: string | null;
  priority?: number | null;
  state?: { name: string; type: string } | null;
  project?: { name: string } | null;
  assignee?: { name: string | null; email: string | null } | null;
  updatedAt?: string;
  createdAt?: string;
}

export interface IssueDetail extends Issue {
  description?: string | null;
  team?: { key: string; name: string } | null;
  comments?: { nodes: IssueComment[] };
}

export interface Comment {
  id?: string;
  body?: string;
  url?: string;
  createdAt?: string;
}

/**
 * List issues, most-recently-updated first. `projects` must already be resolved
 * (the CLI's repo-binding fallback lives in the command layer); an empty list
 * means "no project filter". Other filters compose with AND, matching the CLI.
 */
export async function listIssues(
  o: { projects?: string[]; state?: string; team?: string; assignee?: string; limit?: number } & LinearOpts = {},
): Promise<Issue[]> {
  const projects = o.projects ?? [];
  const filter: Record<string, unknown> = {};
  if (projects.length === 1) filter.project = { name: { eq: projects[0] } };
  else if (projects.length > 1) filter.or = projects.map((p) => ({ project: { name: { eq: p } } }));
  if (o.state) filter.state = { name: { eq: o.state } };
  if (o.team) filter.team = { key: { eq: o.team.toUpperCase() } };
  if (o.assignee) filter.assignee = { email: { eq: o.assignee } };

  const first = o.limit ? Math.max(1, o.limit) : 50;

  const data = await graphql<{ issues: { nodes: Issue[] } }>(
    `query($filter: IssueFilter, $first: Int!) {
       issues(filter: $filter, first: $first, orderBy: updatedAt) {
         nodes { ${ISSUE_FIELDS} }
       }
     }`,
    { apiKey: o.apiKey, profile: o.profile, variables: { filter, first } },
  );
  return data.issues.nodes;
}

/** Fetch a single issue with description + first 100 comments (oldest-first). */
export async function getIssue(idOrIdentifier: string, o: LinearOpts = {}): Promise<IssueDetail> {
  const ref = await resolveIssue(idOrIdentifier, o);
  const data = await graphql<{ issue: IssueDetail }>(
    `query($id: String!) {
       issue(id: $id) {
         ${ISSUE_FIELDS}
         description
         team { key name }
         comments(first: 100) { nodes { id body createdAt user { name } } }
       }
     }`,
    { apiKey: o.apiKey, profile: o.profile, variables: { id: ref.id } },
  );
  return data.issue;
}

/** Create an issue. Throws if Linear reports `success:false`. */
export async function createIssue(
  i: { title: string; team: string; description?: string; project?: string; state?: string } & LinearOpts,
): Promise<Issue> {
  const teamId = await resolveTeamId(i.team, i);
  const input: Record<string, unknown> = { title: i.title, teamId };
  if (i.description) input.description = i.description;
  if (i.project) input.projectId = await resolveProjectId(i.project, i);
  if (i.state) input.stateId = await resolveStateId(teamId, i.state, i);

  const data = await graphql<{ issueCreate: { success: boolean; issue: Issue } }>(
    `mutation($input: IssueCreateInput!) {
       issueCreate(input: $input) {
         success
         issue { ${ISSUE_FIELDS} }
       }
     }`,
    { apiKey: i.apiKey, profile: i.profile, variables: { input } },
  );
  if (!data.issueCreate.success) {
    throw new LinearError(`issueCreate did not succeed for "${i.title}"`);
  }
  return data.issueCreate.issue;
}

/** Add a markdown comment to an issue. Throws if `success:false`. */
export async function createComment(idOrIdentifier: string, body: string, o: LinearOpts = {}): Promise<Comment> {
  const ref = await resolveIssue(idOrIdentifier, o);
  const data = await graphql<{ commentCreate: { success: boolean; comment: Comment } }>(
    `mutation($input: CommentCreateInput!) {
       commentCreate(input: $input) {
         success
         comment { id body url createdAt }
       }
     }`,
    { apiKey: o.apiKey, profile: o.profile, variables: { input: { issueId: ref.id, body } } },
  );
  if (!data.commentCreate.success) {
    throw new LinearError(`commentCreate did not succeed for "${idOrIdentifier}"`);
  }
  return data.commentCreate.comment;
}
