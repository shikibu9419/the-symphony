# The Symphony

my own [symphony](https://github.com/openai/symphony) = Claude Code `/loop` + [linear](https://linear.app/) + [ghq](https://github.com/x-motemen/ghq).

Linear で `symphony` ラベルの付いたプロジェクトを「追跡対象」とし、

- **symphony-setup**: `symphony` ラベル × `Backlog` のプロジェクトを走査し、新規を ghq リポジトリとして自動作成・追跡する（repo 作成・CLAUDE.md 生成・追跡開始 update・In Progress 化）。
- **symphony-loop**: 追跡中（In Progress）の全リポジトリを横断し、Linear の issue をコメントベースで消化していくループ（Claude Code の `/loop` で回す）。設計 issue の起票や実装の判断はここでエージェントが行う。

を組み合わせて、「Linear でやり取りしながら複数プロジェクトの実装・修正・再デプロイを回す」ことを目指す。

symphony-setup は常駐せず、**symphony-loop の冒頭で毎回1回だけ実行される**（詳細は [`LOOP.md`](./LOOP.md)）。

## クイックスタート

```sh
# 1. 事前準備（下記）を揃える
# 2. repo をどの GitHub owner の下に作るかを設定する
git config --global ghq.user <your-github-username>
# 3. clone して配置する
git clone https://github.com/shikibu9419/the-symphony
cd the-symphony
bash scripts/deploy.sh
# 4. Claude Code で /symphony-loop を実行する（または cron / /schedule で定期実行する）
```

## 事前準備

- [bun](https://bun.sh)
- [ghq](https://github.com/x-motemen/ghq)
- [jj](https://github.com/jj-vcs/jj)（新規 repo を colocated init するのに使う）
- Claude Code（`/symphony-loop` を回す）
- linear-cli（公開予定の私のオリジナル CLI ツール。OAuth の agent actor を profile に登録して使う）

## 設定（git config）

repo を作る owner や対象ラベルは git config で指定する（環境変数でも上書き可）。

| キー | 意味 | 既定 / フォールバック |
|---|---|---|
| `symphony.user` | repo を作る GitHub owner | 無ければ `ghq.user` |
| `ghq.user` | 〃（ghq 純正の owner 補完キー） | — |
| `symphony.label` | 追跡対象とみなす Linear ラベル | `symphony` |

環境変数 `SYMPHONY_OWNER` / `SYMPHONY_LABEL` が最優先。owner がどこからも解決できない場合は実行時にエラーで止まる（誤った owner の下に repo を作らないための fail-loud）。

## 仕組み

- `src/` — symphony-setup 本体（bun + TypeScript）。`symphony` ラベル × `Backlog` を走査し、repo 名を解決して新規プロジェクトを取り込む。冪等チェック・status 変更・project update といった JSON/GraphQL 処理を担う。Linear アクセスは全て linear-cli 経由（agent 名義）。repo 作成の機械処理は `scripts/create-repo.sh` に委譲する。
- `scripts/create-repo.sh` — `<ghq root>/github.com/<owner>/<repo>` を作って `git init` + `jj git init --colocate`、`templates/CLAUDE.md` から CLAUDE.md を生成する（冪等）。
- `templates/CLAUDE.md` — 新規リポジトリに設置する CLAUDE.md テンプレート。
- `LOOP.md` — **ループ手順の正典**。`/symphony-loop` コマンドと cron はどちらもこれを読み込んで実行する。冒頭で symphony-setup を実行し、設計 issue の動的起票や実装もここで行う。ループのクエリ・手順を変えるときはここを編集する。
- `commands/symphony-loop.md` — `/symphony-loop` スラッシュコマンド定義（LOOP.md を読んで1回実行する）。
- `scripts/deploy.sh` — ビルドと配置を行う（下記）。

## デプロイ

```sh
bash scripts/deploy.sh
```

`deploy.sh` は以下を行う（定期実行の常駐は仕込まない。実行は symphony-loop の冒頭に任せる）：

1. `bun install` で依存を解決。
2. `bun build --compile` で `src/index.ts` を単一バイナリにして `~/.local/bin/symphony-setup` へ出力。
3. `commands/symphony-loop.md` の `{{LOOP_MD}}` をこの repo の LOOP.md 絶対パスへ置換して `~/.claude/commands/symphony-loop.md` に配置。
4. `scripts/create-repo.sh` と `templates/CLAUDE.md` を `~/.local/libexec/symphony/` に配置（バイナリから参照する）。

## 運用

symphony-setup は symphony-loop の冒頭で毎回実行される。ループ自体の起動は Claude Code の `/symphony-loop`（手動）か、cron / `/schedule` などで定期実行する（例: 毎日 8/12/18時）。

## 謝辞

本システムのインスピレーション元となった symphony を開発した OpenAI 社に敬意を表する。
<https://github.com/openai/symphony>
