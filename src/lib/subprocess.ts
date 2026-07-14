// ローカルの子プロセス (git / jj など) を同期起動する。

import type { RunResult } from "./types";

export function run(cmd: string[], opts: { cwd?: string; env?: Record<string, string> } = {}): RunResult {
  const proc = Bun.spawnSync(cmd, {
    cwd: opts.cwd,
    env: opts.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout ? new TextDecoder().decode(proc.stdout) : "",
    stderr: proc.stderr ? new TextDecoder().decode(proc.stderr) : "",
  };
}
