# The Symphony

自分専用の [symphony](https://github.com/openai/symphony) = **Claude Code `/loop` + ghq + Linear**。

Linear で `symphony` ラベルの付いたプロジェクトを「追跡対象」とし、

- **symphony-setup**: プロジェクトを ghq リポジトリとして自動作成・追跡し、CLAUDE.md 生成・「プロジェクト設計の確定」issue 作成・ステータス更新までを行う（launchd で定期実行）。
- **symphony-loop**: 追跡中（In Progress）の全リポジトリを横断し、Linear の issue をコメントベースで消化していくループ（Claude Code の `/loop` で回す）。

を組み合わせて、「Linear でやり取りしながら複数プロジェクトの実装・修正・再デプロイを回す」ことを目指す。

## 仕組み

- `src/` — symphony-setup 本体（bun + TypeScript）。`bun build --compile` で単一バイナリ `~/.local/bin/symphony-setup` にする。`symphony` ラベル & `Backlog` のプロジェクトを走査し、`<ghq root>/github.com/<owner>/<repo>` を作って `git init` + `jj git init --colocate`、テンプレートから CLAUDE.md を生成する。Linear アクセスは全て linear-cli 経由（agent 名義）。
- `templates/CLAUDE.md` — 新規リポジトリに設置する CLAUDE.md テンプレート（ビルド時にバイナリへ埋め込み）。
- `LOOP.md` — **ループ手順の正典**。`/symphony-loop` コマンドと cron はどちらもこれを読み込んで実行する。ループのクエリ・手順を変えるときはここを編集する。
- `commands/symphony-loop.md` — `/symphony-loop` スラッシュコマンド定義（LOOP.md を読んで1回実行する）。
- `scripts/deploy.sh` — ビルド〜デプロイ〜launchd 登録を一括で行う。

## 事前準備

以下が必要：

- [bun](https://bun.sh)
- [ghq](https://github.com/x-motemen/ghq)
- linear-cli（公開予定の私のオリジナル CLI ツール。OAuth の agent actor を profile に登録して使う）

## 開発

```sh
bun install
DRY_RUN=1 bun run src/index.ts   # 副作用なしで動作確認
```

## インストール

```sh
bash scripts/deploy.sh
```

`deploy.sh` は以下を行う：

1. `bun build --compile` で `src/index.ts` を単一バイナリにコンパイルし `~/.local/bin/symphony-setup` へ出力。
2. `commands/symphony-loop.md` を `~/.claude/commands/symphony-loop.md` へ symlink（冪等）。
3. launchd 用 plist（`~/Library/LaunchAgents/com.shikibu9419.symphony-setup.plist`）を生成・配置。
4. `launchctl` でロード（bootout → bootstrap → enable、冪等）。

環境変数：`SYMPHONY_INTERVAL_SECONDS`（実行間隔・秒、デフォルト 1800）／`SKIP_LAUNCHCTL=1`（plist 生成までで止める）。

## 運用（launchd）

```sh
# 状態確認
launchctl print gui/$(id -u)/com.shikibu9419.symphony-setup

# ログ確認
tail -f ~/.local/var/log/symphony-setup.log

# アンロード
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.shikibu9419.symphony-setup.plist

# 再ロード（deploy.sh の再実行が基本だが手動でも可）
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.shikibu9419.symphony-setup.plist
launchctl enable gui/$(id -u)/com.shikibu9419.symphony-setup
```

crontab 派の場合は launchd の代わりに次のような行でも代替できる（`deploy.sh` はこちらは自動化しない）：

```
*/30 * * * * /Users/kziz/.local/bin/symphony-setup >> /Users/kziz/.local/var/log/symphony-setup.log 2>&1
```

## 謝辞

symphony のオリジナルを開発した OpenAI 社に敬意を表する。
<https://github.com/openai/symphony>
