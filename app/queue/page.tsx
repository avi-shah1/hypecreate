"use client";

import { useEffect, useState } from "react";
import type { QueuePost } from "@/app/api/queue/route";

// Read-only: Ben reviews in chat and Claude records his calls in clips/queue.json.
export default function Queue() {
  const [posts, setPosts] = useState<QueuePost[]>([]);
  const [account, setAccount] = useState("all");

  useEffect(() => {
    // /queue?account=fintechben opens on one account's posts.
    const wanted = new URLSearchParams(window.location.search).get("account");
    fetch("/api/queue")
      .then((res) => res.json())
      .then((list: QueuePost[]) => {
        setPosts(list);
        if (wanted) setAccount(wanted);
      });
  }, []);

  const accounts = [...new Set(posts.map((post) => post.account))];
  const shown = posts.filter((post) => account === "all" || post.account === account);

  return (
    <div className="flex-1 bg-zinc-950 font-sans text-zinc-100">
      <main className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-400">Posting queue</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">{shown.length} posts</h1>
        <div className="mt-6 flex flex-wrap gap-2">
          {["all", ...accounts].map((name) => (
            <button
              key={name}
              onClick={() => setAccount(name)}
              className={`rounded-full border px-4 py-2 ${
                account === name ? "border-emerald-400 bg-emerald-400/15 text-emerald-200" : "border-white/15 text-zinc-300"
              }`}
            >
              {name === "all" ? "All" : `@${name}`}
            </button>
          ))}
        </div>

        <div className="mt-8 space-y-6">
          {shown.map((post) => (
            <article key={post.id} className="grid gap-6 rounded-3xl border border-white/10 bg-zinc-900/50 p-5 md:grid-cols-[16rem_1fr]">
              <video src={post.videoUrl} controls playsInline preload="metadata" className="w-full rounded-2xl bg-black" />
              <div>
                <p className="font-mono text-sm text-zinc-500">
                  {post.id} · {post.note ?? (post.decision === "approved" ? "ready to post" : "waiting for Ben's OK")}
                </p>
                <h2 className="mt-1 text-2xl font-semibold">@{post.account}</h2>
                <p className="mt-1 text-zinc-300">{post.slot}</p>
                <p className="mt-3 text-emerald-300">{post.why}</p>
                <p className="mt-4 whitespace-pre-wrap rounded-2xl bg-white/5 p-4 text-zinc-200">{post.caption}</p>
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
