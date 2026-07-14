import { homedir } from "node:os";
import { gitConfig } from "./config";
import { resolveOwner } from "./owner";

// GitHub オーナー。SYMPHONY_OWNER > symphony.user > ghq.user の順で解決する
// (詳細は owner.ts)。module load 時に一度だけ評価する。
export const OWNER = resolveOwner();

// 追跡対象とみなす Linear ラベル。SYMPHONY_LABEL > symphony.label > 既定 "symphony"。
export const LABEL = process.env.SYMPHONY_LABEL?.trim() || gitConfig("symphony.label") || "symphony";
export const TARGET_STATUS = "Backlog";
export const TEAM_FALLBACK = "KAZ";
export const DIRTY_ISSUE_TITLE = "リポジトリ名の確定";

// repo 名として自動 slug 化できる「クリーンな」ソース文字集合
export const CLEAN_RE = /^[A-Za-z0-9 _-]+$/;
export const REPO_DIRECTIVE_RE = /^\s*repo:\s*(\S+)\s*$/m;

// linear CLI (linear-cli) の実体。launchd 経由など PATH が最小構成の環境でも
// 動くよう、フォールバックとして絶対パスを既定値にする。
export const LINEAR_BIN = process.env.LINEAR_BIN ?? "/Users/kziz/.local/bin/linear";

// repo 作成の機械処理を行う shell script。deploy.sh が ~/.local/libexec/symphony/
// 以下へ templates/ ごと配置する (scripts/create-repo.sh から ../templates/CLAUDE.md
// を相対参照できるレイアウトを保つ)。開発時は SYMPHONY_CREATE_REPO で repo 内の
// scripts/create-repo.sh を直接指せる。
export const CREATE_REPO_SH =
  process.env.SYMPHONY_CREATE_REPO ?? `${homedir()}/.local/libexec/symphony/scripts/create-repo.sh`;

export const DRY = process.env.DRY_RUN === "1";
