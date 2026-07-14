#!/usr/bin/env bash
# symphony-sync / start-tracking / linear のビルドと配置。
#
#   1. bun install で依存を解決する (workspace で linear も解決される)。
#   2. src/sync.ts を単一バイナリにコンパイルして ~/.local/bin/symphony/sync へ出力する
#      (linear/ の lib は import 経由で自動バンドル、AGENTS.md テンプレも埋め込まれる)。
#   3. src/start-tracking.ts を ~/.local/bin/symphony/start-tracking へ出力する
#      (repo 名確定後の追跡開始。Claude が直接呼ぶことがある)。
#   4. linear/src/index.ts を単一バイナリにコンパイルして ~/.local/bin/linear へ出力する
#      (loop の sub agent が使う linear CLI)。
#
# owner / ラベル / linear profile は実行時に git config (symphony.* / ghq.user) から
# 解決するため、このスクリプトでは扱わない。

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="${HOME}/.local/bin"

cd "${REPO_ROOT}"
mkdir -p "${BIN_DIR}/symphony"

echo "==> [1/4] bun install"
bun install

echo "==> [2/4] building ${BIN_DIR}/symphony/sync"
bun build --compile --outfile "${BIN_DIR}/symphony/sync" src/sync.ts

echo "==> [3/4] building ${BIN_DIR}/symphony/start-tracking"
bun build --compile --outfile "${BIN_DIR}/symphony/start-tracking" src/start-tracking.ts

echo "==> [4/4] building ${BIN_DIR}/linear"
bun build --compile --outfile "${BIN_DIR}/linear" linear/src/index.ts

echo "==> done. owner が未解決だと実行時に失敗する。'git config --global symphony.user <name>'"
echo "    (または ghq.user) と 'git config --global symphony.linearProfile <name>' を設定しておくこと。"
