/**
 * `linear graphql '<query>' [--vars '<json>']`
 *
 * The core command: raw GraphQL passthrough with auth injected. Anything the
 * wrapper commands don't cover is reachable here. Agents talk GraphQL; the key
 * stays hidden in client.ts / the Keychain.
 *
 * The query can also be read from stdin when the positional is "-".
 */

import { parseArgs } from "node:util";
import { readStdin } from "../auth-store";
import { graphql } from "../client";
import { printJson, fail } from "../output";

export async function runGraphql(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      vars: { type: "string" },
      "api-key": { type: "string" },
    },
  });

  let query = positionals[0];
  if (query === "-" || query === undefined) {
    query = (await readStdin()).trim();
  }
  if (!query) fail("No query provided. Pass it as an argument or via stdin (`-`).");

  let variables: Record<string, unknown> | undefined;
  if (values.vars) {
    try {
      variables = JSON.parse(values.vars as string);
    } catch (err) {
      fail(`--vars is not valid JSON: ${(err as Error).message}`);
    }
  }

  const data = await graphql(query, {
    apiKey: values["api-key"] as string | undefined,
    variables,
  });
  printJson(data);
}
