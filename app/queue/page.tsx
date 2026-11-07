"use client";

import { useEffect, useState } from "react";
import type { QueuePost } from "@/app/api/queue/route";

export default function Queue() {
  const [posts, setPosts] = useState<QueuePost[]>([]);
  const [account, setAccount] = useState("all");

  useEffect(() => {
    // /queue?account=fintechben opens on one account's posts.
    const wanted = new URLSearchParams(window.location.search).get("account");
    if (wanted) setAccount(wanted);
    fetch("/api/queue")
      .then((res) => res.json())
      .then(setPosts);
  }, []);

  async function decide(id: string, change: Partial<QueuePost>) {
    setPosts((list) => list.map((post) => (post.id === id ? { ...post, ...change } : post)));
    await fetch("/api/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...change }),
    });
  }

  const accounts = [...new Set(posts.map((post) => post.account))];
  const shown = posts.filter((post) => account === "all" || post.account === account);
  const approved = posts.filter((post) => post.decision === "approved").length;

  return (
    <div className="flex-1 bg-zinc-950 font-sans text-zinc-100">
      <main className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-400">Posting queue</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          {approved} of {posts.length} approved
        </h1>
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
            <article
              key={post.id}
              className={`grid gap-6 rounded-3xl border p-5 md:grid-cols-[16rem_1fr] ${
                post.decision === "approved"
                  ? "border-emerald-400/60 bg-emerald-400/5"
                  : post.decision === "hold"
                    ? "border-amber-400/40 bg-amber-400/5"
                    : "border-white/10 bg-zinc-900/50"
              }`}
            >
              <video src={post.videoUrl} controls playsInline preload="metadata" className="w-full rounded-2xl bg-black" />
              <div>
                <p className="font-mono text-sm text-zinc-500">{post.id}</p>
                <h2 className="mt-1 text-2xl font-semibold">@{post.account}</h2>
                <p className="mt-1 text-zinc-300">
                  {post.slot} · {post.platforms.join(", ")}
                </p>
                <p className="mt-3 text-emerald-300">{post.why}</p>
                <p className="mt-4 whitespace-pre-wrap rounded-2xl bg-white/5 p-4 text-zinc-200">{post.caption}</p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => decide(post.id, { decision: "approved" })}
                    className="rounded-full bg-emerald-400 px-5 py-2 font-semibold text-black"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => decide(post.id, { decision: "hold" })}
                    className="rounded-full border border-amber-400/60 px-5 py-2 text-amber-200"
                  >
                    Hold
                  </button>
                  <input
                    defaultValue={post.note ?? ""}
                    onBlur={(event) => decide(post.id, { note: event.target.value })}
                    placeholder="Note: what to change"
                    className="min-w-64 flex-1 rounded-full border border-white/15 bg-zinc-950 px-4 py-2 outline-none focus:border-emerald-400"
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
