# The Symphony

> **ループ手順は [`LOOP.md`](./LOOP.md) が正典。** `/symphony-loop` コマンドと cron（毎日 8/12/18時）はどちらも LOOP.md を読み込んで実行する。ループのクエリ・手順を変えるときは LOOP.md を編集する。

## Linear

This repository is bound to the Linear project **The Symphony**.

- project: `The Symphony`
- project id: `ad3ad08d-ad4d-4109-bb94-e5af992ff3c8`
- team: `KAZ`
- url: https://linear.app/kazuyaizumi/project/c3b10088c116

Work items for this repository live in the Linear project above, and each
issue there holds its own implementation plan and context. When you need the
"what / why" for a task, read that project's issues — do not reconstruct it
from the code alone.

Use the `linear` CLI scoped to this project, e.g.:

    linear issue list --project "The Symphony"
    linear issue get <ID>

If context is still missing, open the project in Linear directly.

## 実装原則（全 symphony repo・sub agent 共通）

- **fail-loud**: swallow errors（例外を握りつぶしログだけ）・失敗を隠す fallback（`[]`/デフォルト値で「動いてるフリ」）は禁止。サブプロセス/API は exit≠0・parse 失敗・not-success を throw（文脈付き）。存在チェックの try/catch は ENOENT のみ許容し他は再 throw。
- **偽データ・偽 OCR・プレースホルダ捏造は禁止**。無いものは「無い」と明示する。**デモ/スクショは必ず実データで撮る**（seed した仮データを本物のように見せない。無理なら「サンプル」と明示）。
- **作業ログだけのコメントを書かない**（コメントは「なぜ」だけ）。
- **Linear 書き込みは必ず agent 名義**（linear-cli の cosmo-agent）。個人アカウントで書き込まない。

## Harness 制約と対処（loop / 実装で浮上した運用知見）

- **launchd 最小環境**: PATH に Homebrew / `~/.local/bin` が無い → plist の `EnvironmentVariables` で PATH 明示＋ログインシェル経由起動。
- **ghq が launchd 下でハング**（git 子プロセス起動前に `pthread_cond_wait`）→ ghq 依存を排除し native `git init`。ghq root は `git config ghq.root` で解決。
- **Linear の actor 判定**: agent 自身のコメントは `botActor.name=="Agent"` **または** `user.name=="Agent"`（OAuth トークン入れ直しで表現が変わる）。両方で判定しないと自分のコメントを見落とし全ユーザコメントを「新規」と誤検出する。
- **Linear コメント読み**: `comments(last:1)` は順序が不正確 → `createdAt` 昇順で全件読む。
- **keychain 書き込み**は SSH / 非 GUI セッションで `User interaction is not allowed` になる → GUI ログインした Mac 本体の Terminal から実行（`auth login --oauth` → `auth callback` を GUI 側で）。壊れた項目は `auth logout` で消してから入れ直す（新規作成は通る）。
- **cron はセッション限定**（Claude 終了で消滅）→ 恒久運用は launchd / `/schedule`。
- **画像添付**は `fileUpload` mutation ＋ presigned PUT で **agent 名義**のまま実現（Linear MCP は個人アカウントになるので使わない）。
- **0.0.0.0 等の外部公開**（無認証で個人データを配信するサーバ）は自動モードのセーフティがブロック → 手動対応 or 認証追加。

## 知見の保存と呼び出し（KAZ-49）

- **横断的原則** → この CLAUDE.md（上記）＋ Claude memory（`no-swallow-errors-fail-loud` 等）。
- **loop 運用の gotcha** → `commands/symphony-loop.md`（cron が毎回読み込む正典）。
- **再利用可能な手順** → Skill。
- **作業状態・次アクション** → Linear の issue / コメント。
- **loop の実装後（review 後）に得た知見・再発防止すべき gotcha は、ここ / Claude memory / loop 定義（commands/symphony-loop.md）に反映すること。** これがこのプロジェクトの「エージェントは忘れるが repo は忘れない」の実装。
