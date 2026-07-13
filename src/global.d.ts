// `bun build --compile` で単一バイナリ化した際、コンパイル後のバイナリは
// リポジトリの templates/ ディレクトリを実行時に参照できない。そのため
// テンプレートは text loader でバイナリに埋め込む (src/template.ts 参照)。
declare module "*.md" {
  const content: string;
  export default content;
}
