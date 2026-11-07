"use client";

import { useEffect, useRef, useState } from "react";

// Plays a short video through the five phases it takes in a viewer's head, on a holographic brain.
// Plain-JS viewer in public/brain/ (WebGL, no dependencies); see public/brain/README.md.
// Used by /brain and by the Studio's result panel.

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

export default function BrainView({ videoUrl }: { videoUrl?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [viewer, setViewer] = useState<Walkthrough | null>(null);
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
      setViewer(w.PPDurchlauf!.start(box.current, data, { karten: maps, ebenen: layers }));
      setStatus("");
    })().catch((e) => setStatus(`Brain could not load: ${e.message}`));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!viewer || !videoUrl) return;
    (async () => {
      const blob = await fetch(videoUrl).then((r) => r.blob());
      await viewer.lade(new File([blob], videoUrl.split("/").pop() ?? "video.mp4", { type: "video/mp4" }));
    })().catch((e) => setStatus(`Could not read the video: ${e.message}`));
  }, [viewer, videoUrl]);

  return (
    <div>
      {status && <p className="text-zinc-500">{status}</p>}
      <div ref={box} />
    </div>
  );
}
