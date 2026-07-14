// git config からの設定読み取り。symphony.* / ghq.* を参照する共通ヘルパ。
// キー未設定 (git config --get の exit 1) は null を返す。null は「設定が無い」
// という正当な状態で、owner のように必須なものは呼び出し側が throw して顕在化させ、
// label のようにデフォルトを持つものはフォールバックする。

export function gitConfig(key: string): string | null {
  const proc = Bun.spawnSync(["git", "config", "--get", key], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0) {
    return null;
  }
  const value = new TextDecoder().decode(proc.stdout).trim();
  return value || null;
}
