# The Symphony

Linear で `symphony` ラベルかつ `Backlog` ステータスのプロジェクトを走査し、
リポジトリを作成 / 追跡する自動化。

- `src/` — bun + TypeScript 実装。単一バイナリとしてデプロイする本体。
- `templates/CLAUDE.md` — 新規リポジトリに設置する CLAUDE.md のテンプレート。ビルド時に `src/template.ts` 経由でバイナリへ埋め込まれる (実行時ファイル読みには依存しない)。
- `commands/symphony-loop.md` — `/symphony-loop` スラッシュコマンド。追跡中の全リポジトリを横断して Linear issue を消化するループ。

Linear へのアクセスは全て `linear` CLI (linear-cli, `/Users/kziz/.local/bin/linear`) をサブプロセス起動して行う。MCP や Linear API 直叩き、SDK は使わない。リモート(GitHub)連携・push・並行実行ロックは実装していない。

## セットアップ / ビルド

```sh
bun install
```

開発時は直接実行できる:

```sh
DRY_RUN=1 bun run src/index.ts
```

## デプロイ

`scripts/deploy.sh` が以下を一括で行う:

1. `bun build --compile` で `src/index.ts` を単一バイナリにコンパイルし `~/.local/bin/symphony-setup` へ出力。
2. `commands/symphony-loop.md` を `~/.claude/commands/symphony-loop.md` へ symlink (冪等)。
3. launchd 用 plist (`~/Library/LaunchAgents/com.shikibu9419.symphony-setup.plist`) を生成・配置。
4. `launchctl` でロード (bootout → bootstrap → enable、冪等)。

```sh
bash scripts/deploy.sh
```

環境変数:

- `SYMPHONY_INTERVAL_SECONDS` — 実行間隔 (秒)。デフォルト `1800` (30分)。
- `SKIP_LAUNCHCTL=1` — ビルド・symlink・plist 生成までで止め、`launchctl` によるロードは行わない (確認用)。

バイナリを直接ビルドしたいだけなら:

```sh
bun build --compile --outfile ~/.local/bin/symphony-setup src/index.ts
```

## launchd 管理

`scripts/deploy.sh` がロード済みの状態でも、手動で操作したい場合:

```sh
# 状態確認
launchctl print gui/$(id -u)/com.shikibu9419.symphony-setup

# ログ確認
tail -f ~/.local/var/log/symphony-setup.log

# アンロード
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.shikibu9419.symphony-setup.plist

# 再ロード (deploy.sh を再実行するのが基本だが手動でも可)
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.shikibu9419.symphony-setup.plist
launchctl enable gui/$(id -u)/com.shikibu9419.symphony-setup
```

crontab 派の場合は launchd の代わりに次のような行でも代替できる (`scripts/deploy.sh` はこちらは自動化しない):

```
*/30 * * * * /Users/kziz/.local/bin/symphony-setup >> /Users/kziz/.local/var/log/symphony-setup.log 2>&1
```

## 動作確認 (DRY_RUN)

副作用 (git/jj/ファイル書き込み/issue作成/mutation) を一切行わずログのみ出す:

```sh
DRY_RUN=1 bun run src/index.ts
# もしくはビルド済みバイナリで
DRY_RUN=1 ~/.local/bin/symphony-setup
```

## 実装上のポイント

- **In Progress の projectStatus id を動的解決**: ワークスペース固定 id をハードコードせず、起動時に `query{organization{projectStatuses{id name}}}` から `name=="In Progress"` の id を解決する。
- **ghq に依存しない**: `ghq create` は launchd 実行コンテキストで固まる (git 子プロセスを起こす前に `pthread_cond_wait` でハング) ため、`<ghq root>/github.com/<owner>/<name>` を作って `git init` する処理をネイティブに再現している。ghq root は `GHQ_ROOT` → `git config ghq.root` → `~/ghq` の順で解決する。
- **テンプレート埋め込み**: `bun build --compile` した単体バイナリは repo の `templates/` を参照できないため、`templates/CLAUDE.md` の内容は `import tmpl from "../templates/CLAUDE.md" with { type: "text" }` でバイナリにバンドルする。
