#!/usr/bin/env bash
# repo 作成の機械処理をまとめたスクリプト。symphony-setup バイナリ (src/) から
# 呼ばれ、<ghq root>/github.com/<owner>/<name> を作って git/jj を初期化し、
# CLAUDE.md をテンプレートから生成する。冪等 (既にある要素はスキップ)。
#
# 使い方:
#   scripts/create-repo.sh <owner>/<name>
#
# CLAUDE.md のテンプレート変数は環境変数で受け取る:
#   PROJECT_NAME PROJECT_ID PROJECT_SLUG_ID TEAM_KEY ORG_URLKEY
#
# テンプレート:
#   SYMPHONY_TEMPLATE が指す CLAUDE.md。未指定ならこのスクリプトからの相対で
#   ../templates/CLAUDE.md (repo レイアウト / deploy 後の libexec レイアウト両対応)。
#
# 成功時、作成した repo の絶対パスを標準出力へ1行で返す。

set -euo pipefail

if [ "$#" -ne 1 ] || [ -z "${1:-}" ]; then
  echo "usage: create-repo.sh <owner>/<name>" >&2
  exit 2
fi
REPO_FULL="$1"
case "${REPO_FULL}" in
  */*) : ;;
  *) echo "error: repo は <owner>/<name> 形式で指定してください (指定値: ${REPO_FULL})" >&2; exit 2 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="${SYMPHONY_TEMPLATE:-${SCRIPT_DIR}/../templates/CLAUDE.md}"
if [ ! -f "${TEMPLATE}" ]; then
  echo "error: CLAUDE.md テンプレートが見つかりません: ${TEMPLATE}" >&2
  exit 1
fi

# ghq root を ghq バイナリを起動せず解決する (ghq は最小環境でハングし得る)。
# ghq の規則に倣い GHQ_ROOT → git config ghq.root → ~/ghq。複数指定は先頭を採る。
# 先頭の ~ は HOME へ展開する。
resolve_ghq_root() {
  local root
  if [ -n "${GHQ_ROOT:-}" ]; then
    root="${GHQ_ROOT%%:*}"
  else
    root="$(git config --get ghq.root 2>/dev/null | head -n1 || true)"
    [ -n "${root}" ] || root="${HOME}/ghq"
  fi
  case "${root}" in
    "~") root="${HOME}" ;;
    "~/"*) root="${HOME}/${root#\~/}" ;;
  esac
  printf '%s' "${root}"
}

ROOT="$(resolve_ghq_root)"
REPO_PATH="${ROOT}/github.com/${REPO_FULL}"

mkdir -p "${REPO_PATH}"

if [ ! -e "${REPO_PATH}/.git" ]; then
  git init "${REPO_PATH}" >/dev/null
fi

if [ ! -e "${REPO_PATH}/.jj" ]; then
  ( cd "${REPO_PATH}" && jj git init --colocate >/dev/null )
fi

if [ ! -e "${REPO_PATH}/CLAUDE.md" ]; then
  # sed だとテンプレート変数値に含まれる区切り文字 (# / 等) で壊れるため、
  # bash のパラメータ展開で安全に全置換する。
  content="$(cat "${TEMPLATE}")"
  content="${content//'{{PROJECT_NAME}}'/${PROJECT_NAME:-}}"
  content="${content//'{{PROJECT_ID}}'/${PROJECT_ID:-}}"
  content="${content//'{{PROJECT_SLUG_ID}}'/${PROJECT_SLUG_ID:-}}"
  content="${content//'{{TEAM_KEY}}'/${TEAM_KEY:-}}"
  content="${content//'{{ORG_URLKEY}}'/${ORG_URLKEY:-}}"
  printf '%s' "${content}" > "${REPO_PATH}/CLAUDE.md"
fi

printf '%s\n' "${REPO_PATH}"
