"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import BrainView from "./brain-view";

// Brain view on its own page. /brain?video=/renders/x.mp4 opens with that video loaded.

export default function BrainPage() {
  const [video, setVideo] = useState<string>();

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("video");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (fromUrl?.startsWith("/")) setVideo(fromUrl);
  }, []);

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
          <button
            onClick={() => setVideo("/studio/sample-ad.mp4")}
            className="rounded-lg border border-zinc-300 px-4 py-2 font-medium"
          >
            Analyze the sample ad
          </button>
          <Link href="/studio" className="rounded-lg px-4 py-2 text-zinc-500">
            Back to the studio
          </Link>
        </div>
      </div>
      <div className="mt-6">
        <BrainView videoUrl={video} />
      </div>
    </main>
  );
}
