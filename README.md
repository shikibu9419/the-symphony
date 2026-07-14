# The Symphony

my own [symphony](https://github.com/openai/symphony) = Claude Code `/loop` + [linear](https://linear.app/) + [ghq](https://github.com/x-motemen/ghq).

Linear で `symphony` ラベルの付いたプロジェクトを「追跡対象」とし、

- **symphony sync**: `symphony` ラベル × `Backlog` のプロジェクトを走査し、新規を ghq リポジトリとして自動作成・追跡する（repo 作成・AGENTS.md 生成・追跡開始 update・In Progress 化）。
- **ループ**: 追跡中（In Progress）の全リポジトリを横断し、Linear の issue をコメントベースで消化していく（Claude Code の `/loop` で回す）。初期 issue の要否/種類（目的/設計/不要）の判断や実装はここでエージェントが行う。

を組み合わせて、「Linear でやり取りしながら複数プロジェクトの実装・修正・再デプロイを回す」ことを目指す。

symphony sync は常駐せず、**ループの冒頭で毎回1回だけ実行される**（手順は [`LOOP.md`](./LOOP.md)）。

## 事前準備

- [bun](https://bun.sh)
- [ghq](https://github.com/x-motemen/ghq)
- [jj](https://github.com/jj-vcs/jj)（新規 repo を colocated init するのに使う）
- Claude Code（`/loop` でループを回す）

linear-cli（OAuth の agent actor を profile に登録して使う私のオリジナル CLI）は
この repo の [`linear/`](./linear) に同梱してある（別 clone は不要）。`install.sh` が
`linear` バイナリをビルドし、symphony sync 本体は同じ lib を in-process import する。

## クイックスタート

```sh
# Add your config
git config --global symphony.user <your-github-username>
git config --global symphony.linearProfile <your-linear-cli-profile>
# Clone and deploy
git clone https://github.com/shikibu9419/the-symphony
cd the-symphony
bash install.sh
```

初回は linear-cli の profile に OAuth の agent actor を登録しておくこと
（`linear auth login --oauth --profile <name>` → GUI 側で `auth callback`）。その profile 名を
`symphony.linearProfile` に設定する。

Claude Code でループを回す（例: 毎日 8/12/18時に実行）:

```
/loop 0 8/12/18 * * * @LOOP.md の通りにイテレーションを開始
```

## 設定（git config）

owner・対象ラベル・linear profile は git config で指定する。

| キー | 意味 | 既定 / フォールバック |
|---|---|---|
| `symphony.user` | repo を作る GitHub owner | 無ければ `ghq.user`（どちらも無ければ実行時エラー） |
| `symphony.linearProfile` | Linear アクセスに使う linear-cli の profile（actor） | 無ければ実行時エラー |
| `symphony.label` | 追跡対象とみなす Linear ラベル | `symphony` |
| `symphony.issueLimit` | 1回の実行で拾う open issue の上限（追跡中プロジェクト横断、updatedAt 降順） | `5` |
| `symphony.staleDays` | last:agent でも最終コメントがこの日数を超えて古ければ「停滞」として出す（`0` で無効） | `7` |

owner / linear profile がどこからも解決できない場合は実行時にエラーで止まる（誤った owner の下に repo を作ったり、誤った actor で書き込んだりしないための fail-loud）。

Linear の読み書きは、この `symphony.linearProfile` を linear-cli の lib 呼び出しに
**明示で渡す**（環境変数は使わない）。cwd の `.linear-cli.json` 由来の profile に依存せず、
常に同じ actor 名義で行うためのフェイルセーフ。

## 仕組み

Linear へのアクセスは二面ある: **symphony sync 本体は `linear-cli/lib` を in-process import**
して直接叩き、**ループの sub agent は `linear` CLI バイナリ**を叩く。どちらも同じ `linear/` の
コードを共有する（monorepo）。

- `linear/` — 取り込んだ [linear-cli](https://linear.app/)（self-contained な Linear GraphQL CLI）。`src/lib.ts` に `listIssues`/`getIssue`/`createIssue`/`createComment` と `graphql` passthrough を切り出し、`src/commands/*` はそれを呼ぶ薄い CLI 層。`install.sh` が `~/.local/bin/linear` にビルドし、ループの sub agent が使う。API キーはバイナリ内に隠れ、agent の手には渡らない。
- `src/sync.ts` — `~/.local/bin/symphony/sync` 本体（末尾の `import.meta.main` がエントリ）。`symphony` ラベル × `Backlog` を走査し、repo 名を解決できれば追跡を開始（`startTracking`）、できなければ `リポジトリ名の確定` issue 起票 + `offTrack` の project update（**機械処理のみ**。初期 issue の要否などの判断は loop = LOOP.md）。最後に追跡中プロジェクトの open issue（＋最終コメントが user 由来か）を stdout に一覧する。
- `src/start-tracking.ts` — repo 確定後の追跡開始（repo 作成 → `onTrack` の追跡開始 update → In Progress 化）。sync 内から呼ばれるほか、`~/.local/bin/symphony/start-tracking <project> <repo>` として単体でも起動でき（Claude が repo 名確定後に直接呼ぶ）、解決した `<owner>/<repo>` を stdout に返す。
- `src/lib/` — 汎用の葉モジュール。`linear.ts`（`linear-cli/lib` を profile 明示で叩くラッパ）、`repo-resolve.ts`（repo 名解決）、`config.ts` / `log.ts`（進捗は stderr）/ `types.ts` / `subprocess.ts`。
- `templates/AGENTS.md` — 新規リポジトリに設置する AGENTS.md テンプレート（ビルド時にバイナリへ埋め込まれる）。
- `LOOP.md` — ループ手順。冒頭で symphony sync を実行し、初期 issue の要否/種類判断や実装もここで行う。手順・クエリを変えるときはここを編集する。
- `install.sh` — ビルドと配置を行う（下記）。

## Linear のセットアップ（agent actor）

`install.sh` の後に、Linear へ書き込む actor を用意する。Personal API Key は常に **その所有者（人間）** として振る舞うので、issue やコメントを **エージェント名義** で残すには Linear の **OAuth application を `actor=app`** で使う（＝アプリ自身が actor になる）。symphony はこの profile を `symphony.linearProfile` に設定して使う。

1. **OAuth application を作る**（一度だけ）: Linear の Settings → API → **OAuth applications** で新規作成。redirect に `http://localhost:8788/callback` を入れる。メンション/アサイン可能な agent にするには、そのアプリの **agent capability** と `app:*` スコープも有効化する。
2. **CLI に app 情報を渡す**: `~/.config/linear-cli/oauth.json` を作る（または対応する env）:
   ```json
   { "clientId": "...", "clientSecret": "...", "redirectUri": "http://localhost:8788/callback", "actor": "app" }
   ```
3. **agent profile でログイン**（`actor=app` が既定 = エージェント名義）:
   ```sh
   linear auth login --oauth --profile <agent-profile>
   # ローカル(GUI): ブラウザが開いて callback を自動取得。
   # SSH/headless: authorize URL が表示される → 自分の Mac で開いて承認 → redirect URL を貼る:
   linear auth callback 'http://localhost:8788/callback?code=...&state=...'
   ```
   ⚠️ Keychain 書き込みは GUI ログインした Mac 本体の Terminal で行う（SSH だと `User interaction is not allowed`）。
4. **確認**: `linear auth status --profile <agent-profile>` → `viewer` に agent が出れば OK（`name` は表示名で、profile 名とは別物）。
5. **symphony に profile を教える**: `git config --global symphony.linearProfile <agent-profile>`。以降 symphony の読み書きは全てこの actor 名義で行われる。

（`<agent-profile>` は linear-cli の profile 名 = Keychain のアカウント名。表示名ではなく、自分で付けた profile 名を使う。）

## 謝辞

本システムのインスピレーション元となった symphony を開発した OpenAI 社に敬意を表する。
<https://github.com/openai/symphony>
