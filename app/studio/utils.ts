import type { Beat } from "@/lib/contract";

const compactFormat = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/** 2300000 -> "2.3M" */
export function compact(count: number): string {
  return compactFormat.format(count);
}

/** 110.05 -> "110×", 2.71 -> "2.7×" */
export function multiple(times: number): string {
  return `${times >= 10 ? Math.round(times) : times.toFixed(1)}×`;
}

/** 5000 -> "5k" */
export function thousands(count: number): string {
  return count >= 1000 ? `${Math.round(count / 1000)}k` : String(count);
}

/** A beat's time range: "0–4s" */
export function span(beat: Pick<Beat, "fromSeconds" | "toSeconds">): string {
  const trim = (value: number) => String(Math.round(value * 10) / 10);
  return `${trim(beat.fromSeconds)}–${trim(beat.toSeconds)}s`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
