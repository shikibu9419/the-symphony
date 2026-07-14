// git config (symphony.* / ghq.*) から設定を読む。環境変数では受け付けない。

// 未設定 (git config --get の exit≠0) は null。必須のものは呼び出し側が throw、
// 既定を持つものはフォールバックする。
export function gitConfig(key: string): string | null {
  const proc = Bun.spawnSync(["git", "config", "--get", key], { stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) {
    return null;
  }
  const value = new TextDecoder().decode(proc.stdout).trim();
  return value || null;
}

// GitHub owner。repo のフルネーム <owner>/<name> と ghq パスを決める。誤った owner は
// 無関係な場所に repo を作るので、解決できなければ throw する (既定値で動くフリをしない)。
export function resolveOwner(): string {
  const fromSymphony = gitConfig("symphony.user");
  if (fromSymphony) {
    return fromSymphony;
  }
  const fromGhq = gitConfig("ghq.user");
  if (fromGhq) {
    return fromGhq;
  }
  throw new Error("GitHub owner を解決できませんでした。`git config --global symphony.user <name>` (または ghq.user) を設定してください。");
}

export const OWNER = resolveOwner();

export const LABEL = gitConfig("symphony.label") ?? "symphony";
export const TARGET_STATUS = "Backlog";
export const DIRTY_ISSUE_TITLE = "リポジトリ名の確定";

// 1回の実行で拾う open issue の上限 (追跡中プロジェクト横断、updatedAt 降順)。
// git config symphony.issueLimit > 既定 5。不正値は握りつぶさず throw する。
function resolveIssueLimit(): number {
  const raw = gitConfig("symphony.issueLimit");
  if (raw === null) {
    return 5;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`symphony.issueLimit は正の整数で指定してください (指定値: ${raw})`);
  }
  return n;
}

export const ISSUE_LIMIT = resolveIssueLimit();

// last:agent の issue でも最終コメントがこの日数を超えて古ければ「停滞」として要対応に含める。
// git config symphony.staleDays > 既定 7。0 で停滞を出さない。
function resolveStaleDays(): number {
  const raw = gitConfig("symphony.staleDays");
  if (raw === null) {
    return 7;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`symphony.staleDays は 0 以上の整数で指定してください (指定値: ${raw})`);
  }
  return n;
}

export const STALE_DAYS = resolveStaleDays();

// repo 名として自動 slug 化できる「クリーンな」文字集合
export const CLEAN_RE = /^[A-Za-z0-9 _-]+$/;
export const REPO_DIRECTIVE_RE = /^\s*repo:\s*(\S+)\s*$/m;

// Linear アクセスに使う linear-cli の profile (actor)。書き込みが cwd の .linear-cli.json
// でなく常に同じ actor 名義になるよう、全呼び出しに明示で渡す (src/lib/linear.ts)。
// 既定値は持たない (誤った actor で書くくらいなら止める)。
function resolveLinearProfile(): string {
  const p = gitConfig("symphony.linearProfile");
  if (!p) {
    throw new Error("linear profile を解決できませんでした。`git config --global symphony.linearProfile <name>` を設定してください。");
  }
  return p;
}

export const LINEAR_PROFILE = resolveLinearProfile();

// 副作用なしの確認実行 (設定でなく実行モードなので CLI フラグで受ける)。
export const DRY = process.argv.includes("--dry-run");
