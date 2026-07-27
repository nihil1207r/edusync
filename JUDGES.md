# EduNexus — one-page brief for judges

## The pitch
Most school-app dashboards drown parents and teachers in raw data. EduNexus's
AI Insight Layer does the opposite: it surfaces the one thing you need to
know, discloses its own confidence, and refuses to fake certainty it doesn't
have.

## Where to click (in order)
1. **Admin → School Simulator** — ask "what if we delay start by 20 minutes?"
   Estimated from real attendance/homework/bus-timing baselines, with the
   coefficients shown, not hidden.
2. **Teacher → Friendship Intelligence** — isolation-risk and seating
   suggestions computed from real per-session participation logs, always
   shown with sample size, always requiring teacher accept/reject before
   anything happens.
3. **Parent/Student → Daily Summary ("Invisible Parent")** — one calm
   paragraph, not a dashboard with charts. That's a deliberate design
   choice, not a missing feature — see "Honest caveats" below.
4. **Parent/Student → School Memory** — natural-language search over real
   logged school events, answered via a parameterized query, not free text
   reaching SQL.

## What's real vs. what we're honest about
- RLS is the actual enforcement layer (not just written and ignored),
  MFA is real TOTP via Supabase, payments use a signature-verified webhook.
- The AI layer works with **zero API keys** (rule-based fallback) and
  upgrades automatically if a Gemini key is present.
- **Honest caveat, ask us if you want**: the "self-review" step on AI
  answers is one model checking its own draft, not two independent models
  debating — we built it that way on purpose after confirming the
  originally-planned second provider has no reliable free tier, and we'd
  rather say that plainly than oversell it.

## What we intentionally left out of this round's demo
Fees/payments, MFA enrollment, and the gamification suite (skill tree,
streaks, curiosity bounty) all work end-to-end but aren't novel — we're not
spending your attention on them live. Ask and we'll show any of it.

## One-line technical summary
Next.js + Go/Fiber + Supabase (Postgres/GoTrue), 35 tables, RLS on every
table, real audit logging, Vitest + Go unit tests + Playwright e2e specs.
Full honest accounting of what's tested live vs. structurally validated
only is in `NOTES.md`.
