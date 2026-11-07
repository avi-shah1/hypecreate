"use client";

import { useRef, useState } from "react";
import { profileFor, RESEARCH_STEPS, type BrandProfile } from "./brand-profile";
import { sleep } from "./utils";

const STEP_MS = 600;

interface Props {
  profile: BrandProfile | null;
  onProfile: (profile: BrandProfile | null) => void;
}

/** Step 0 of the Studio: research the company, then hand its profile and guardrails to the rest of the flow. */
export default function Research({ profile, onProfile }: Props) {
  const [url, setUrl] = useState("https://www.lodavo.com/en-us");
  // -1 before the first run; 0..6 while a step is running; RESEARCH_STEPS.length when finished.
  const [step, setStep] = useState(-1);
  const [unsupported, setUnsupported] = useState(false);
  const runNumber = useRef(0);
  const running = step >= 0 && step < RESEARCH_STEPS.length;

  async function research() {
    const mine = ++runNumber.current;
    onProfile(null);
    setUnsupported(false);
    const found = profileFor(url.trim());
    if (!found) {
      setStep(-1);
      setUnsupported(true);
      return;
    }
    for (let index = 0; index < RESEARCH_STEPS.length; index++) {
      if (mine !== runNumber.current) return;
      setStep(index);
      await sleep(STEP_MS);
    }
    if (mine !== runNumber.current) return;
    setStep(RESEARCH_STEPS.length);
    onProfile(found);
  }

  return (
    <section className="mt-12">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          research();
        }}
        className="rounded-3xl border border-white/10 bg-zinc-900/60 p-6 md:p-8"
      >
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-400">Step 1 · Research the company</p>
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <label className="block">
            <span className="text-sm font-medium text-zinc-400">Company URL</span>
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3.5 text-xl outline-none focus:border-sky-400"
            />
          </label>
          <button
            type="submit"
            disabled={running || !url.trim()}
            className="rounded-2xl bg-sky-400 px-8 py-4 text-xl font-semibold text-black transition hover:bg-sky-300 disabled:opacity-40"
          >
            {running ? "Researching…" : "Research"}
          </button>
        </div>

        {unsupported && (
          <p className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-lg text-amber-200">
            Demo supports Lodavo only.
          </p>
        )}

        {step >= 0 && (
          <ol className="mt-6 space-y-2.5">
            {RESEARCH_STEPS.map((label, index) => {
              const state = index < step ? "done" : index === step ? "active" : "waiting";
              const last = index === RESEARCH_STEPS.length - 1;
              return (
                <li
                  key={label}
                  className={`flex items-center gap-3 text-lg transition-opacity ${state === "waiting" ? "opacity-25" : ""} ${
                    last && state === "done" ? "font-semibold text-emerald-300" : ""
                  }`}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                    {state === "done" ? (
                      <span className="text-emerald-400">✓</span>
                    ) : state === "active" ? (
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
                    )}
                  </span>
                  {label}
                </li>
              );
            })}
          </ol>
        )}
      </form>

      {profile && <ProfileCard profile={profile} />}
    </section>
  );
}

function ProfileCard({ profile }: { profile: BrandProfile }) {
  return (
    <article className="mt-6 rounded-3xl border border-sky-400/30 bg-zinc-900/60 p-6 md:p-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-400">Brand profile</p>
          <h2 className="mt-2 text-4xl font-semibold tracking-tight">{profile.company}</h2>
          <p className="mt-1 text-zinc-400">
            {profile.category} · {profile.hq} ·{" "}
            <a href={profile.url} target="_blank" rel="noreferrer" className="underline decoration-zinc-600 hover:text-zinc-200">
              {profile.url.replace(/^https?:\/\//, "")}
            </a>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-sm font-medium text-emerald-300">
            Canada: {profile.status.canada}
          </span>
          <span className="rounded-full bg-amber-400/15 px-3 py-1 text-sm font-medium text-amber-300">
            US: {profile.status.us}
          </span>
        </div>
      </header>

      <p className="mt-6 text-2xl leading-snug md:text-3xl">{profile.oneLiner}</p>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <Block title="How it works">
          <ol className="space-y-2">
            {profile.howItWorks.map((line, index) => (
              <li key={line} className="flex gap-3 text-lg">
                <span className="font-mono text-sky-400">{index + 1}</span>
                {line}
              </li>
            ))}
          </ol>
        </Block>

        <Block title="Taglines">
          <ul className="space-y-2">
            {profile.taglines.map((line) => (
              <li key={line} className="text-lg italic text-zinc-200">
                “{line}”
              </li>
            ))}
          </ul>
        </Block>

        <Block
          title={
            <>
              Proof points <span className="ml-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] tracking-widest">CANADA</span>
            </>
          }
        >
          <ul className="flex flex-wrap gap-2">
            {profile.proofPointsCanada.map((point) => (
              <li key={point} className="rounded-xl bg-white/5 px-3 py-1.5 text-base font-medium">
                {point}
              </li>
            ))}
          </ul>
        </Block>

        <Block title="Trust">
          <ul className="flex flex-wrap gap-2">
            {profile.trust.map((badge) => (
              <li key={badge} className="rounded-full border border-emerald-400/30 px-3 py-1 text-sm text-emerald-200">
                ✓ {badge}
              </li>
            ))}
          </ul>
        </Block>

        <Block title="Audience">
          <p className="text-lg text-zinc-200">{profile.audience}</p>
        </Block>

        <Block title="Voice">
          <p className="text-lg text-zinc-200">{profile.voice}</p>
          <p className="mt-3 text-sm text-zinc-500">Call to action: {profile.primaryCTA}</p>
        </Block>
      </div>

      <div className="mt-8 rounded-2xl border border-red-500/40 bg-red-500/10 p-5 md:p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-red-400">Guardrails · every script obeys these</p>
        <div className="mt-4 grid gap-6 md:grid-cols-[2fr_1fr]">
          <div>
            <p className="text-sm text-red-300/80">Never say</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {profile.doNotSay.map((rule) => (
                <li key={rule} className="rounded-full bg-red-500/15 px-3 py-1 text-sm font-medium text-red-200">
                  ✕ {rule}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm text-red-300/80">Always include</p>
            <ul className="mt-2 space-y-1.5">
              {profile.requiredDisclaimers.map((line) => (
                <li key={line} className="text-base font-semibold text-red-100">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <p className="mt-6 text-sm text-zinc-600">Sources: lodavo.com/en-us · {profile.press.join(" · ")}</p>
    </article>
  );
}

function Block({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">{title}</p>
      {children}
    </div>
  );
}
