"use client";

import type { StudioVideo } from "./videos/route";

/** Every finished video on this laptop, from GET /studio/videos. */
export default function RecentAds({ videos }: { videos: StudioVideo[] }) {
  if (videos.length === 0) return null;
  return (
    <section className="mt-16">
      <h2 className="text-3xl font-semibold tracking-tight">Ready to post</h2>
      <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
        {videos.map((video) => (
          <figure key={video.url}>
            <div className="relative aspect-[9/16] overflow-hidden rounded-2xl border border-white/10 bg-black">
              <video
                src={video.url}
                className="h-full w-full object-cover"
                controls
                loop
                playsInline
                preload="metadata"
              />
              <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-violet-500/90 px-2 py-0.5 text-xs font-semibold">
                {video.model?.startsWith("Real") || video.model?.includes("b-roll") ? "Real clips" : "AI-generated"}
              </span>
            </div>
            <figcaption className="mt-2">
              <p className="font-medium capitalize leading-snug">{video.name}</p>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
