// `templates/CLAUDE.md` の内容をビルド時にバイナリへ埋め込む。
// `bun build --compile` されたバイナリは repo の templates/ を参照できないため、
// 実行時ファイル読みには依存しない。
import tmpl from "../templates/CLAUDE.md" with { type: "text" };

export const TEMPLATE: string = tmpl;
