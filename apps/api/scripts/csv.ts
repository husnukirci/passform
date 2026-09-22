// CSV encoding for `COPY ... FROM STDIN WITH (FORMAT csv)`. Every non-null
// value is quoted, so the only special case is null, which is an empty
// unquoted field.

export type CsvValue = string | number | boolean | null;

function quote(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function csvField(value: CsvValue): string {
  if (value === null) return "";
  if (typeof value === "string") return quote(value);
  return String(value);
}

export function csvLine(values: readonly CsvValue[]): string {
  return `${values.map(csvField).join(",")}\n`;
}

/** Postgres array literal for a `text[]` column, ready for csvField. */
export function pgTextArray(items: readonly string[]): string {
  return `{${items.map((item) => `"${item.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`).join(",")}}`;
}

/** Groups lines into chunks of roughly `bytes`, so COPY sees fewer, larger writes. */
export async function* chunked(
  lines: AsyncIterable<string>,
  bytes = 64 * 1024,
): AsyncGenerator<string> {
  let buffer = "";
  for await (const line of lines) {
    buffer += line;
    if (buffer.length >= bytes) {
      yield buffer;
      buffer = "";
    }
  }
  if (buffer.length > 0) yield buffer;
}
