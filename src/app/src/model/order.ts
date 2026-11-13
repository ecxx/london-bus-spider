// app_design 3.7: the route order.
//   1. Lines with no letter prefix, by number.
//   2. Lines with a letter prefix that is not N, by prefix, then by number.
//   3. Night lines (prefix N), by number.

type OrderKey = [group: number, prefix: string, num: number, name: string];

function orderKey(name: string): OrderKey {
  const [, prefix = "", num = ""] = /^([A-Z]*)(\d*)/.exec(name)!;
  return [!prefix ? 0 : prefix === "N" ? 2 : 1, prefix, num ? Number(num) : 0, name];
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function compareLineNames(a: string, b: string): number {
  const x = orderKey(a);
  const y = orderKey(b);
  return x[0] - y[0] || cmp(x[1], y[1]) || x[2] - y[2] || cmp(x[3], y[3]);
}

export const compareLines = (a: { name: string }, b: { name: string }): number => compareLineNames(a.name, b.name);
