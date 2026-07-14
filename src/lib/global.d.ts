// `with { type: "text" }` でテキスト import する Markdown の TS 型を供給する
// (templates/AGENTS.md をバイナリへ埋め込むために import しているため)。
declare module "*.md" {
  const content: string;
  export default content;
}
