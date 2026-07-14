// GitHub オーナー (username / org) の解決。symphony-setup が作る repo の
// フルネーム <owner>/<name> や ghq パス <ghq root>/github.com/<owner>/<name>
// はこの値で決まるため、誤ったオーナーは無関係な場所に repo を作ってしまう。
//
// 解決順: 環境変数 SYMPHONY_OWNER > `git config symphony.user` > `git config ghq.user`。
// いずれも得られなければ throw する (fail-loud)。「取れなければ既定値」で動くフリを
// すると別人のリポジトリを掴むので、無いものは無いと即エラーにする。
//
// ghq.user は ghq 純正の owner 補完キー。symphony.user はそれを上書きしたいとき用。

import { gitConfig } from "./config";

export function resolveOwner(): string {
  const fromEnv = process.env.SYMPHONY_OWNER?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const fromSymphony = gitConfig("symphony.user");
  if (fromSymphony) {
    return fromSymphony;
  }
  const fromGhq = gitConfig("ghq.user");
  if (fromGhq) {
    return fromGhq;
  }
  throw new Error(
    "GitHub owner を解決できませんでした。`git config --global symphony.user <name>` " +
      "(または ghq.user) を設定するか、環境変数 SYMPHONY_OWNER を指定してください。",
  );
}
