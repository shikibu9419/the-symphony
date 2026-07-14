/** Tiny shared output helpers. Agent-facing commands default to JSON. */

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

/** Print an error as JSON to stdout and exit non-zero. Never leaks secrets. */
export function fail(message: string, code = 1): never {
  printJson({ ok: false, error: message });
  process.exit(code);
}
