#!/usr/bin/env bash
# symphony-setup デプロイスクリプト。
#
# 定期実行 (launchd/cron) は持たない。symphony-setup は symphony-loop の冒頭で
# 1回だけ実行される想定 (LOOP.md 参照)。このスクリプトは「ビルドと配置」に徹する。
#
# 行うこと:
#   1. bun install で依存を解決する。
#   2. `bun build --compile` で src/index.ts を単一バイナリにコンパイルし
#      ~/.local/bin/symphony-setup へ出力する。
#   3. commands/symphony-loop.md 中の {{LOOP_MD}} をこの repo の LOOP.md 絶対パスへ
#      置換し ~/.claude/commands/symphony-loop.md として配置する (冪等)。
#   4. repo 作成用の scripts/create-repo.sh と templates/CLAUDE.md を
#      ~/.local/libexec/symphony/ 以下へ配置する (バイナリから参照できるよう、
#      create-repo.sh から ../templates/CLAUDE.md を相対解決できるレイアウトを保つ)。
#
# owner / ラベル / 対象 status はバイナリが実行時に git config (symphony.* / ghq.user)
# などから解決するため、このスクリプトでは扱わない。

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_PATH="${HOME}/.local/bin/symphony-setup"
COMMAND_SRC="${REPO_ROOT}/commands/symphony-loop.md"
COMMAND_DST="${HOME}/.claude/commands/symphony-loop.md"
LIBEXEC="${HOME}/.local/libexec/symphony"

cd "${REPO_ROOT}"

echo "==> [1/4] bun install"
bun install

echo "==> [2/4] building ${BIN_PATH}"
mkdir -p "${HOME}/.local/bin"
bun build --compile --outfile "${BIN_PATH}" src/index.ts

echo "==> [3/4] installing symphony-loop command (LOOP.md -> ${REPO_ROOT}/LOOP.md)"
mkdir -p "$(dirname "${COMMAND_DST}")"
# 旧バージョンが symlink を張っていた場合、リダイレクトが repo 内の実体を上書き
# しないよう、まず消してから生成する。
rm -f "${COMMAND_DST}"
# {{LOOP_MD}} を this repo の LOOP.md 絶対パスへ置換して配置する。owner/home に
# 依存しない雛形を、配置時に実環境の絶対パスへ解決する。
sed "s#{{LOOP_MD}}#${REPO_ROOT}/LOOP.md#g" "${COMMAND_SRC}" > "${COMMAND_DST}"
echo "    wrote ${COMMAND_DST}"

echo "==> [4/4] installing create-repo.sh + CLAUDE.md template to ${LIBEXEC}"
mkdir -p "${LIBEXEC}/scripts" "${LIBEXEC}/templates"
install -m 0755 "${REPO_ROOT}/scripts/create-repo.sh" "${LIBEXEC}/scripts/create-repo.sh"
install -m 0644 "${REPO_ROOT}/templates/CLAUDE.md" "${LIBEXEC}/templates/CLAUDE.md"
echo "    installed ${LIBEXEC}/scripts/create-repo.sh"

echo "==> done. symphony-setup は symphony-loop の冒頭で実行される (LOOP.md 参照)。"
echo "    owner が未解決だと実行時に失敗する。'git config --global ghq.user <name>' か"
echo "    symphony.user / SYMPHONY_OWNER を設定しておくこと。"
