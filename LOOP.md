# Symphony ループ手順

## 基本の手順

0. まずは `~/.local/bin/symphony/sync` を必ず実行し、プロジェクトおよびIssuesを確認すること。もしexit≠0 なら設定ミスか外部サービスの500エラーなので、原因を解消してから再度実行すること。
1. Issuesを1つずつ確認し、タスク整理を行う（section 1参照）
2. 各プロジェクトにsub agentsを配置し、実装を行う（section 2参照）

## 1. タスク整理

以下の場合分けで作業を進めること。

1. もし「リポジトリ名の確定」Issueでユーザのリポジトリ名の指示（`repo: <owner>/<name>`）があれば、`~/.local/bin/symphony/start-tracking <プロジェクト名> <リポジトリ名>` を実行。そのissueはDoneにする。
  - `start-tracking`：`ghq create` + `jj git init`のみを行うスクリプト。返り値 `<owner>/<repo>` が作成された repo
2. それ以外は、Issuesそれぞれについてコメントを `linear issue get <ID>` で `createdAt` 昇順に50件読む。
  - 実装方針が定まっていない場合：あなたの方で実装方針を調査の上提案する。
  - 実装方針が十分に定まっている場合：ユーザに実装開始を宣言の上実装を始める（section 2参照）。

注意点：
- 基本的にユーザからのコメントは全て精読の上返信する。
- コメントがないIssueは、現状を調査し実装方針をコメントする。
- blocker（設計未確定 / repo 名未確定 / 依存待ち / ユーザ判断待ち等）を把握し、必要なら該当 issue にコメントで明示する。
- Issueの実装は以下の優先順位で行う： `In Progress`なもの -> `In Review`かつユーザから指摘があったもの -> 実装方針が固まっている最古の `Backlog`。

## 2. Issue の実装
自分が触っていないのに jj 差分がある場合は他プロセスが実装中とみなし、実装をスキップする。
そうでないなら、以下の手順でIssueの実装を行う。

1. **着手時にまず status を `In Progress` に**する（`linear issue update <issue ID> --state "In Progress"`）。
2. Sonnet の sub agent に<プロジェクト名>と<Issue番号>と<Issueのコメント>を渡し、実装・動作確認・網羅的テストをさせる。
3. Sub agentが正常に終了したら、status を `In Review` にして、ユーザの確認を待つ。

注意点：
- 必ずIssueの実行計画はあなたが、実装はSonnet の sub agentが行うこと。
- あなたは実装計画の立案とユーザとLinearでのやり取りしかやらないこと。
- もし何かしらのSonnetのミスや問題が発生したら、あなた自ら修正を図り、難しければissueを通してユーザに報告すること。
