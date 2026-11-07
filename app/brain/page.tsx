"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// Brain view: plays a short video through the five phases it takes in a viewer's head, on a holographic brain.
// Plain-JS viewer in public/brain/ (WebGL, no dependencies); see public/brain/README.md.

type Walkthrough = { lade: (file: File) => Promise<void> };
type BrainWindow = Window & {
  PPGehirn?: {
    laden: (bin: string, json: string) => Promise<{ netz: { n: number } }>;
    karten: (bin: string, json: string, data: unknown) => Promise<unknown>;
    ebenen: (bin: string, json: string, n: number) => Promise<unknown>;
  };
  PPDurchlauf?: { start: (box: HTMLElement, data: unknown, opt: unknown) => Walkthrough };
};

const SCRIPTS = ["brain.js", "analysis.js", "phases.js", "walkthrough.js"];

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[data-brain="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = `/brain/${src}`;
    s.dataset.brain = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`${src} failed to load`));
    document.head.appendChild(s);
  });
}

export default function BrainPage() {
  const box = useRef<HTMLDivElement>(null);
  const viewer = useRef<Walkthrough | null>(null);
  const [status, setStatus] = useState("Loading the brain …");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const src of SCRIPTS) await loadScript(src);
      const w = window as BrainWindow;
      const data = await w.PPGehirn!.laden("/brain/fsaverage5.bin", "/brain/regions.json");
      const [maps, layers] = await Promise.all([
        w.PPGehirn!.karten("/brain/maps.bin", "/brain/maps.json", data).catch(() => null),
        w.PPGehirn!.ebenen("/brain/layers.bin", "/brain/layers.json", data.netz.n).catch(() => null),
      ]);
      if (cancelled || !box.current) return;
      box.current.innerHTML = "";
      viewer.current = w.PPDurchlauf!.start(box.current, data, { karten: maps, ebenen: layers });
      setStatus("");
    })().catch((e) => setStatus(`Brain could not load: ${e.message}`));
    return () => {
      cancelled = true;
    };
  }, []);

  async function analyzeSample() {
    const blob = await fetch("/studio/sample-ad.mp4").then((r) => r.blob());
    await viewer.current?.lade(new File([blob], "sample-ad.mp4", { type: "video/mp4" }));
  }

  return (
    <main className="mx-auto w-full max-w-6xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Brain view</h1>
          <p className="mt-1 text-zinc-500">
            How a viewer&apos;s brain takes in the first seconds of an ad, phase by phase, on measured brain maps.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={analyzeSample} className="rounded-lg border border-zinc-300 px-4 py-2 font-medium">
            Analyze the sample ad
          </button>
          <Link href="/" className="rounded-lg px-4 py-2 text-zinc-500">
            Back to formats
          </Link>
        </div>
      </div>
      {status && <p className="mt-6 text-zinc-500">{status}</p>}
      <div ref={box} className="mt-6" />
    </main>
  );
}
