# The Symphony

## Linear

This repository is bound to the Linear project **The Symphony**. Work items live
there; each issue holds its own plan and context — read the project's issues for
the "what / why", don't reconstruct it from the code alone.

    linear issue list --project "The Symphony"
    linear issue get <ID>


## for Sub Agent

- 各リポジトリで作業を始める前に、そのルートの `CLAUDE.md` を読むこと。
- 必ず最後は`/codex:adversarial-review -m gpt-5.6-terra <レビュー指示>` で設計修正やリファクタの指示を受けること。
- review 後、再発防止すべき知見・gotcha は 作業した repo の `AGENTS.md`に反映してから終える。横断的な原則なら the-symphony 本体の `AGENTS.md`に反映。
- 終わったら`jj desc`（変更箇所と目的を詳細に）＋ `jj new` で変更内容のスナップショットを撮ること。
- ユーザからの指摘を修正した場合は、変更は可能なら 以前のchange ID に適用する（jj log の時系列を保つ。分割指示があれば新規 change）。

## 実装原則（全 symphony repo・sub agent 共通）

- フロントエンド UI 修正時は apple-design スキルを先に読む。
- **fail-loud**: エラーの握りつぶしは邪悪の所業である。swallow errors（例外を握りつぶしログだけ）・失敗を隠す fallback（`[]`/デフォルト値で「動いてるフリ」）は禁止。サブプロセス/API は exit≠0・parse 失敗・not-success を throw（文脈付き）。存在チェックの try/catch は ENOENT のみ許容し他は再 throw。
- **偽データ・偽 OCR・プレースホルダ捏造は行わず、何があっても嘘をつかない**。無いものは「無い」と明示する。**デモ/スクショは必ず実データで撮る**（seed した仮データを本物のように見せない。無理なら「サンプル」と明示）。
- **作業ログだけのコメントを書かない**（コメントは「なぜ」だけ）。

## Harness 制約と対処（loop / 実装で浮上した運用知見）

- **keychain 書き込み**は SSH / 非 GUI セッションで `User interaction is not allowed` になる → GUI ログインした Mac 本体の Terminal から実行（`auth login --oauth` → `auth callback` を GUI 側で）。壊れた項目は `auth logout` で消してから入れ直す（新規作成は通る）。
- **画像添付**は `fileUpload` mutation ＋ presigned PUT で **agent 名義**のまま実現（Linear MCP は個人アカウントになるので使わない）。
- **0.0.0.0 等の外部公開**（無認証で個人データを配信するサーバ）は自動モードのセーフティがブロック → 手動対応 or 認証追加。

## 知見の保存と呼び出し

- **横断的原則** → この AGENTS.md（上記）＋ Claude memory（`no-swallow-errors-fail-loud` 等）。
- **loop 運用の gotcha** → `LOOP.md`（ループ手順）。
- **再利用可能な手順** → Skill。
- **作業状態・次アクション** → Linear の issue / コメント。
- **loop の実装後（review 後）に得た知見・再発防止すべき gotcha は、ここ / Claude memory / `LOOP.md` に反映すること。** これがこのプロジェクトの「エージェントは忘れるが repo は忘れない」の実装。

