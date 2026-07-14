---
description: Symphony — 追跡中の全リポジトリを横断して Linear issue を消化するループを1回実行する
---

`{{LOOP_MD}}` を Read し、そこに書かれたループ手順（セクション 0〜2 と実装時のルール）を**そのまま「今この1回」だけ実行**する。LOOP.md が唯一の正典なので、必ず毎回読み直してから従うこと（内容は更新され得る）。

<!-- {{LOOP_MD}} は scripts/deploy.sh が配置時に this repo の LOOP.md 絶対パスへ置換する。
     このファイル自体は雛形なので、直接編集して手で ~/.claude/commands/ に置いても
     プレースホルダのままでは動かない。必ず deploy.sh 経由で配置すること。 -->

注意:
- **新しい cron を作らない**。実行スケジュール（毎日 8:00/12:00/18:00）は別途 cron が管理している。このコマンドは手動での1回実行用。
- 書き込みは必ず agent 名義（linear-cli の cosmo-agent）。個人アカウントでは書き込まない。
- 新規ユーザ返信の検出では、自分（agent）のコメントを `botActor.name=="Agent"` または `user.name=="Agent"` の両方で判定すること。
