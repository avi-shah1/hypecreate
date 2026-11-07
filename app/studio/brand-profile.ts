// The Studio's "Research company" result, hardcoded for the demo from
// lodavo-brand-brief.md: section 14 is the profile, section 15 the agent steps.
// The brief was sourced from lodavo.com/en-us and press coverage; nothing here is invented.

export interface BrandProfile {
  company: string;
  url: string;
  category: string;
  oneLiner: string;
  hq: string;
  founders: string[];
  status: { canada: string; us: string };
  howItWorks: string[];
  taglines: string[];
  proofPointsCanada: string[];
  trust: string[];
  audience: string;
  voice: string;
  primaryCTA: string;
  doNotSay: string[];
  requiredDisclaimers: string[];
  press: string[];
}

/** What the script step must obey, sent with every generate request. */
export interface Guardrails {
  doNotSay: string[];
  requiredDisclaimers: string[];
}

export const LODAVO_PROFILE: BrandProfile = {
  company: "Lodavo",
  url: "https://www.lodavo.com/en-us",
  category: "Prize-linked savings app",
  oneLiner: "Free app that gives you weekly cash-draw tickets for saving. Your money stays in your own bank.",
  hq: "Montreal (founded 2022)",
  founders: ["Benjamin Thomas (CEO)", "Luke Freund", "Arie Mednikov"],
  status: { canada: "Live (iOS + Android)", us: "Waitlist open, no launch date" },
  howItWorks: [
    "Save: connect your bank via Plaid",
    "Play: pick lucky numbers; more saving = more tickets",
    "Win: match winning numbers in the weekly draw",
  ],
  taglines: [
    "What if saving felt exciting?",
    "Save money. Earn tickets. Win prizes.",
    "The thrill of the lottery with the security of saving.",
  ],
  proofPointsCanada: [
    "1,000+ users",
    "$2M+ savings tracked",
    "1M+ tickets earned",
    "4.7★ App Store & Google Play",
    "Guaranteed weekly winner since launch",
  ],
  trust: [
    "Read-only bank access: can't move or withdraw money",
    "Plaid connection",
    "Bank-grade encryption",
    "Provably fair, verifiable draws",
    "Never sells data",
    "100% free",
  ],
  audience: "Gen Z & young adults building first savings habits; low-savings, paycheck-to-paycheck savers",
  voice: "Upbeat, playful, gamified, always paired with safety and transparency",
  primaryCTA: "Join the US waitlist (100 bonus tickets at launch)",
  doNotSay: [
    "US prize amounts/odds/dates",
    "guaranteed winnings",
    "free money/get rich",
    "interest rates/returns",
    "FDIC insured",
    "fake balances or testimonials",
    "competitor names",
  ],
  requiredDisclaimers: ["No purchase necessary.", "AI-generated"],
  press: ["Global News", "CTV News", "MSN", "Yahoo News", "Fintech.ca", "Canadian Fintech"],
};

export const RESEARCH_STEPS = [
  "Reading lodavo.com/en-us…",
  "Extracting product, pricing & how it works…",
  "Scanning press coverage (Global News, CTV, Fintech.ca)…",
  "Identifying audience & brand voice…",
  "Building compliance guardrails (US pre-launch)…",
  "Matching Lodavo to winning fintech formats from Oriane…",
  "Brand profile ready",
];

/** The demo knows one company. Any URL on lodavo.com gets its profile; anything else gets null. */
export function profileFor(url: string): BrandProfile | null {
  try {
    const host = new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./, "");
    return host === "lodavo.com" ? LODAVO_PROFILE : null;
  } catch {
    return null;
  }
}

export function guardrailsOf(profile: BrandProfile): Guardrails {
  return { doNotSay: profile.doNotSay, requiredDisclaimers: profile.requiredDisclaimers };
}
