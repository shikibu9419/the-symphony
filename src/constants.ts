export const OWNER = "shikibu9419";
export const LABEL = "symphony";
export const TARGET_STATUS = "Backlog";
export const TEAM_FALLBACK = "KAZ";
export const DIRTY_ISSUE_TITLE = "リポジトリ名の確定";
export const DESIGN_ISSUE_TITLE = "プロジェクト設計の確定";

// repo 名として自動 slug 化できる「クリーンな」ソース文字集合
export const CLEAN_RE = /^[A-Za-z0-9 _-]+$/;
export const REPO_DIRECTIVE_RE = /^\s*repo:\s*(\S+)\s*$/m;

// linear CLI (linear-cli) の実体。launchd 経由など PATH が最小構成の環境でも
// 動くよう、フォールバックとして絶対パスを既定値にする。
export const LINEAR_BIN = process.env.LINEAR_BIN ?? "/Users/kziz/.local/bin/linear";

export const DRY = process.env.DRY_RUN === "1";
