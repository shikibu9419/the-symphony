/** Shared GraphQL helpers for the wrapper commands (issue/comment). */

import { graphql, LinearError, type LinearOpts } from "./client";

const IDENTIFIER_RE = /^[A-Za-z][A-Za-z0-9]*-\d+$/;

export interface IssueRef {
  id: string; // UUID
  identifier: string; // e.g. KAZ-38
  title: string;
  teamId: string;
  teamKey: string;
}

/**
 * Resolve either a human identifier (KAZ-38) or a raw UUID to the issue's core
 * fields. Identifiers are looked up via a team-key + number filter; UUIDs use
 * the `issue(id:)` node query. `opts` carries the auth selection (api key /
 * profile) so in-process callers can force an actor without the env/cwd binding.
 */
export async function resolveIssue(idOrIdentifier: string, opts: LinearOpts = {}): Promise<IssueRef> {
  const CORE = `id identifier title team { id key }`;

  if (IDENTIFIER_RE.test(idOrIdentifier)) {
    // IDENTIFIER_RE guarantees exactly one `-` with non-empty sides, so both
    // halves are present (the `!` satisfies noUncheckedIndexedAccess).
    const [key, numStr] = idOrIdentifier.split("-");
    const data = await graphql<{ issues: { nodes: Array<RawIssue> } }>(
      `query($key: String!, $num: Float!) {
         issues(filter: { team: { key: { eq: $key } }, number: { eq: $num } }, first: 1) {
           nodes { ${CORE} }
         }
       }`,
      { ...opts, variables: { key: key!.toUpperCase(), num: Number(numStr) } },
    );
    const node = data.issues.nodes[0];
    if (!node) throw new LinearError(`Issue not found: ${idOrIdentifier}`);
    return toRef(node);
  }

  const data = await graphql<{ issue: RawIssue | null }>(
    `query($id: String!) { issue(id: $id) { ${CORE} } }`,
    { ...opts, variables: { id: idOrIdentifier } },
  );
  if (!data.issue) throw new LinearError(`Issue not found: ${idOrIdentifier}`);
  return toRef(data.issue);
}

interface RawIssue {
  id: string;
  identifier: string;
  title: string;
  team: { id: string; key: string };
}

function toRef(n: RawIssue): IssueRef {
  return { id: n.id, identifier: n.identifier, title: n.title, teamId: n.team.id, teamKey: n.team.key };
}

/** Find a workflow state's UUID by (case-insensitive) name within a team. */
export async function resolveStateId(teamId: string, stateName: string, opts: LinearOpts = {}): Promise<string> {
  const data = await graphql<{ workflowStates: { nodes: Array<{ id: string; name: string }> } }>(
    `query($teamId: ID!) {
       workflowStates(filter: { team: { id: { eq: $teamId } } }, first: 100) {
         nodes { id name }
       }
     }`,
    { ...opts, variables: { teamId } },
  );
  const wanted = stateName.trim().toLowerCase();
  const match = data.workflowStates.nodes.find((s) => s.name.toLowerCase() === wanted);
  if (!match) {
    const available = data.workflowStates.nodes.map((s) => s.name).join(", ");
    throw new LinearError(`No workflow state named "${stateName}" in this team. Available: ${available}`);
  }
  return match.id;
}

/** Resolve a team by key (KAZ) or name to its UUID. */
export async function resolveTeamId(keyOrName: string, opts: LinearOpts = {}): Promise<string> {
  const data = await graphql<{ teams: { nodes: Array<{ id: string; key: string; name: string }> } }>(
    `query { teams(first: 250) { nodes { id key name } } }`,
    opts,
  );
  const wanted = keyOrName.trim().toLowerCase();
  const match =
    data.teams.nodes.find((t) => t.key.toLowerCase() === wanted) ||
    data.teams.nodes.find((t) => t.name.toLowerCase() === wanted);
  if (!match) throw new LinearError(`No team matching "${keyOrName}"`);
  return match.id;
}

/** Resolve a project by name to its UUID (optionally scoped to a team). */
export async function resolveProjectId(name: string, opts: LinearOpts = {}): Promise<string> {
  const data = await graphql<{ projects: { nodes: Array<{ id: string; name: string }> } }>(
    `query { projects(first: 250) { nodes { id name } } }`,
    opts,
  );
  const wanted = name.trim().toLowerCase();
  const match = data.projects.nodes.find((p) => p.name.toLowerCase() === wanted);
  if (!match) throw new LinearError(`No project named "${name}"`);
  return match.id;
}
