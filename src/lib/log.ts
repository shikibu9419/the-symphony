// ローカル時刻・秒精度・タイムゾーン情報なし (例: 2026-07-13T14:20:31) の
// タイムスタンプ付きログ行を出力する。

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function timestamp(d: Date): string {
  const y = d.getFullYear();
  const mo = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const s = pad(d.getSeconds());
  return `${y}-${mo}-${day}T${h}:${mi}:${s}`;
}

// 進捗ログは stderr に出す。stdout は「結果」(sync のサマリ / start-tracking の owner/repo)
// 専用にして、呼び出し側がパイプで結果だけ取れるようにする。
export function log(msg: string): void {
  console.error(`[${timestamp(new Date())}] ${msg}`);
}
