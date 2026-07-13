# The symphony

It's my [symphony](https://github.com/openai/symphony) = Claude Code `/loop` + ghq + Linear.

## 事前準備

以下を準備する必要がある：
- [bun](TODO: URL)
- [ghq](TODO: URL)
- linear-cli (公開予定の私のオリジナルCLIツール)

## Development

```sh
bun install
```

## Install

```sh
bash scripts/deploy.sh
# 1. `bun build --compile` で `src/index.ts` を単一バイナリにコンパイルし `~/.local/bin/symphony-setup` へ出力。
# 2. `commands/symphony-loop.md` を `~/.claude/commands/symphony-loop.md` へ symlink (冪等)。
# 3. launchd 用 plist (`~/Library/LaunchAgents/com.shikibu9419.symphony-setup.plist`) を生成・配置。
# 4. `launchctl` でロード (bootout → bootstrap → enable、冪等)。
```

## cronjobs

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


## 謝辞

symphonyのオリジナルを開発したOpenAI社に敬意を表する。
https://github.com/openai/symphony
