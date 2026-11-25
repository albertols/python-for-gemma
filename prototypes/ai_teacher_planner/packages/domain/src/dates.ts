export type IsoDate = string; // "YYYY-MM-DD"
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7; // ISO, Monday = 1

const MS_PER_DAY = 86_400_000;
const SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(d: IsoDate): [number, number, number] {
  const m = SHAPE.exec(d);
  if (!m) throw new Error(`Not an ISO date: ${d}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function toMs(d: IsoDate): number {
  const [y, m, day] = parts(d);
  return Date.UTC(y, m - 1, day);
}

function fromMs(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isIsoDate(s: string): boolean {
  const m = SHAPE.exec(s);
  if (!m) return false;
  return fromMs(toMs(s)) === s;
}

export function addDays(d: IsoDate, n: number): IsoDate {
  return fromMs(toMs(d) + n * MS_PER_DAY);
}

export function weekdayOf(d: IsoDate): Weekday {
  const js = new Date(toMs(d)).getUTCDay(); // 0 = Sunday
  return (js === 0 ? 7 : js) as Weekday;
}

export function mondayOf(d: IsoDate): IsoDate {
  return addDays(d, 1 - weekdayOf(d));
}

/** b - a, in whole days. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((toMs(b) - toMs(a)) / MS_PER_DAY);
}

/** Every date from `from` to `to`, inclusive. Empty when `to` is before `from`. */
export function eachDay(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
