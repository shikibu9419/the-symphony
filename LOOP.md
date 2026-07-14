# Symphony ループ手順（正典）

追跡中の全リポジトリを横断して Linear issue を消化するループの手順書。**これが唯一の正典**で、`commands/symphony-loop.md`（`/symphony-loop` スラッシュコマンド）と cron の両方がこれを読み込んで実行する。実行スケジュールは cron が管理する（現在: 毎日 8時 / 12時 / 18時 の3回）。

対象は「Linear で `symphony` ラベルかつ In Progress のプロジェクト」全体（＝追跡中の全リポジトリ）。**ループ全体で1つ**であり、プロジェクトごとにループを分けない。Linear へのアクセスは全て `linear` CLI（linear-cli）で行い、MCP は使わない（**書き込み actor は linear-cli の既定 profile = cosmo-agent、必ず agent 名義で行うこと。個人アカウントでは書き込まない**）。

## 0. 対象の列挙とコンテキスト分離
- 追跡中プロジェクト一覧を取得する:
  `linear graphql 'query { projects(filter:{ labels:{name:{eq:"symphony"}}, status:{name:{eq:"In Progress"}} }){ nodes { id name } } }'`
- 各プロジェクトはローカルの ghq リポジトリ `~/projects/github.com/shikibu9419/<repo>` に対応し、その repo の CLAUDE.md に Linear プロジェクトの紐付けが書いてある。
- **リポジトリごとに Sonnet の sub agent を割り当てて処理し、コンテキストを混ぜない。** 親（Opus）はオーケストレーションと最終レビューに徹する。各 sub agent には「担当 repo のパス」「担当 Linear プロジェクト名」を渡し、そこから issue 状況を自分で取得させる。
- **assignee が付いている issue には手をつけない**（人間が対応中とみなす）。issue 列挙時に assignee 付きを除外する。
- The Symphony 自身も対象に含まれる（自己改善するため）。

以降 1〜2 は、各リポジトリについて順に行う。

## 1. Linear の情報整理（ここではコード変更を一切しない）
0) その repo で実装中のものがあれば実装に専念し、情報整理はスキップする。
1) 担当プロジェクトの `Backlog` / `In Progress` / `In Review` の issue を `linear issue list --project "<name>" --state <state>` で取得し内容を確認する。**各 issue の全コメントを `linear issue get <ID>` で取得し、`createdAt` 昇順で最初から最後まで読む**（最後の1件だけを見ない。`comments(last:1)` は順序が不正確なので使わない）。ユーザが連続で複数コメントしている場合、途中のコメントを取りこぼさない。
2) **setup 由来の issue（`リポジトリ名の確定` / `プロジェクト設計の確定`）を最優先で確認する:**
   - これらの issue は symphony-setup が立て、ユーザがコメントで指示を書く。現状の issue 対応と同じ要領でコメントを拾って進める。
   - `プロジェクト設計の確定` が未完（未 Done）の間は、**そのプロジェクトの他 issue の実装には着手しない。** 設計をユーザと詰めることに集中し、コメントに応じて設計方針を更新・返信する。
   - 設計が確定（issue が Done）したら 2. の実装フェーズに進む。
3) ユーザも自分もコメントしていない新規 issue には、現状の実装や状況を調査し実装方針をコメント送信する。
4) 新規でない issue は、ユーザから新規返信があった時のみ実装への反映や返信をする。**「新規返信」は「自分（Agent）の最後のコメントより後に付いたユーザコメント」で判定し、そのようなコメントが複数あれば全て拾って対応する**（最新1件だけに反応しない）。**actor 判定に注意**: 自分（agent）のコメントは Linear 上 `botActor.name == "Agent"` または `user.name == "Agent"` のどちらでも現れる（OAuth トークン入れ直しで表現が変わる）。**自分のコメントは「botActor.name=="Agent" または user.name=="Agent"」で判定**し、ユーザ返信は `user.name` が人間の名前（例 "Kazuya Izumi"）のものだけを対象にする。ここを誤ると自分のコメントを見落とし、全ユーザコメントを「新規」と誤検出する。返信があった場合は必ず何かしらのアクションを行う（stay 禁止：ユーザが次の手を見失う）。返信がなければ何もしない。
5) 進行の妨げ（blocker: 設計未確定 / repo 名未確定 / 依存待ち / ユーザ判断待ち等）の把握に努め、必要なら該当 issue にコメントで明示する。

## 2. Issue の実装作業（設計確定後のみ）
0) 自分が何もしていないのに jj で差分がある場合、他プロセスのエージェントが実装中の可能性がある。その repo の処理はスキップしてよい。
1) 作業対象 issue の優先順位: 1.1) 作業中(In Progress)の issue → 1.2) In Review のユーザ指摘対応 → 1.3) 実装方針が固まっている中で作成が最も古い Backlog/In Progress。
2) 手順:
   2.1) **着手を決めた時点で、まず該当 issue の status を `In Progress` に変更する**（`linear issue update <ID> --state "In Progress"`）。sub agent に実装を渡す前に必ず最初に行う（In Review へ直接飛ばさない）。その上で実装・検証・テスト計画を立てる。設計更新が要れば積極的に。
   2.2) Sonnet の sub agent に計画を提示し、実装・動作確認・網羅的テストをさせる（実装ルール徹底）。
   2.3) review スキルでリファクタ。swallow errors や作業ログコメントは特に抹消。必要なら再度 sub agent。
   2.4) 十分にテスト・リファクタしたら `jj desc`（変更箇所と目的を詳細に）＋ `jj new` で change 保存。
   2.5) 該当 issue に change ID・変更内容を投稿（フロントの見た目を修正した場合 playwright でスクショを撮って共有すること）。status を `In Review` に変更。
   2.6) ユーザの動作確認待ち。変更要望が来たら該当 change ID に適用する形で修正（jj log の時系列をなるべく保つ。分割指示があれば新規 change）。

## 実装時のルール
- 最後に必ず review スキルで自分（Opus）自身がコードを修正（sub agent 任せにしない）。
- フロントエンド UI 修正時は apple-design スキルを読み込んでから。
- 作業ログだけのコメント、swallow errors、不要なフォールバックは抹消。偽データ・偽 OCR・プレースホルダの捏造もしない（無いものは「無い」と明示。デモ/スクショは実データで撮る）。エラーは握りつぶさず throw する fail-loud 方針。
- **知見の反映**: review 後、ループ運用や実装で浮上した再発防止すべき知見・gotcha は `CLAUDE.md`（横断原則・Harness 知見）／ Claude memory ／ この `LOOP.md` に反映してから終える。詳細は CLAUDE.md の「知見の保存と呼び出し（KAZ-49）」を参照。
