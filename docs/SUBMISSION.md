# Devpost submission text

Copy/paste into the Devpost “Enter a Submission” form. Keep English.

## Inspiration

Freelancers live in chat — Slack, email, iMessage — but billing still means hunting through the PayPal invoice UI. We wanted an agent that understands “bill Acme $500 for logo design, due in 14 days, remind them in 3 days” and turns it into real PayPal invoicing, with a human still in control of anything that contacts the client.

## What it does

**Invoice Copilot** is a chat-first PayPal agent for freelancers and small businesses:

- Creates PayPal invoice drafts from natural language
- Sends, reminds, and cancels invoices **only after UI confirmation**
- Lists invoices and summarizes who owes what
- Shows PayPal payment links when PayPal returns them (the QR image is a labelled placeholder, not a scannable code)
- Shows an invoice desk (unpaid, collected, drafts) labelled with its source: PayPal sandbox or local mock
- Runs in polished **demo mode with zero credentials** (local mock: no PayPal call, no email), or locally against PayPal **sandbox** + any OpenAI-compatible LLM

## How we built it

- **Next.js 15 App Router + TypeScript + Tailwind** for a polished product UI (chat + dashboard)
- **Vercel AI SDK** for tool-calling when an LLM key is present
- **Official `@paypal/agent-toolkit`** (AI SDK adapter) for Invoicing tools against the PayPal sandbox
- A **built-in demo agent** + in-memory mock PayPal store so judges can experience the full flow without signing up
- Confirmation API that gates send / remind / cancel (human-in-the-loop agentic commerce): the model can only propose; the server executes after the UI Confirm, once, for the same browser session
- Deploy configs for **Vercel** and **Render** (hosted = zero-key demo; live credentials are local-only)

## Security & limits

- No user authentication. Live credentials work only on a server bound to 127.0.0.1 (`npm run dev` / `npm start`), and the API also refuses non-loopback requests (local single-user use).
- Sandbox-only: any `PAYPAL_ENVIRONMENT` other than `sandbox` disables PayPal.
- Pending actions are bound to an HttpOnly session cookie and expire after 15 minutes. Each is dispatched to PayPal at most once per server process. An ambiguous failure after dispatch is never retried; the user is asked to check PayPal.
- Client chat history is validated (only `user` / `assistant` text). Chat output is rendered without raw HTML. Provider errors are redacted.
- State is in memory in one process: it is lost on restart and not shared across instances.
- Tests: `npm test` runs 73 offline tests in 4 files (stubbed PayPal toolkit, fake LLM model, no network); on 2026-11-07 all passed, together with `tsc --noEmit` and `next build`. The live sandbox path was checked by hand for the demo video.
- Full list: `docs/security.html`.

## Challenges we ran into

- Designing a safe agent: never auto-email clients — confirmation cards for every outbound action
- Keeping the experience excellent both with and without credentials (hackathon judges must be able to run it)
- Mapping messy natural language (amounts, due dates, reminder schedules, business names) onto PayPal invoice schemas
- Keeping live sandbox and local mock paths separate and honestly labelled, without leaking secrets or breaking demos

## Accomplishments that we're proud of

- End-to-end agentic invoicing loop: chat → draft → confirm → send → remind → summary (the QR is still a labelled placeholder)
- Equal focus on **Design** and **Presentation** (judging criteria) — not just a CLI proof of concept
- Zero-config demo path that still feels like a product
- A short credential checklist for running the live path locally against the PayPal sandbox

## What we learned

- PayPal's Agent Toolkit is a strong fit for agentic commerce when paired with explicit confirmation UX
- Demo/mock fidelity matters as much as the live path for hackathon judging
- Freelancer invoicing is a high-clarity vertical for showcasing AI + payments

## What's next

- Recurring invoice series and auto-remind schedules via toolkit
- Multi-currency + tax lines from natural language
- Slack / email adapters so the agent lives where freelancers already work
- Webhook-driven “invoice paid” celebrations in chat

## Built with

- Next.js, React, TypeScript, Tailwind CSS
- Vercel AI SDK (`ai`), `@ai-sdk/openai-compatible`
- `@paypal/agent-toolkit` (PayPal Invoicing v2)
- Vitest, Node.js
- Groq (`openai/gpt-oss-20b`) for live LLM tool-calling

## Try it

1. `npm ci && npm run dev` — demo mode, no keys
2. Add `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` / `LLM_API_KEY` from `.env.example` for live sandbox, and open the app on `localhost` (live mode is loopback-only)
3. See `docs/demo.html` for the demo script and `docs/media/devpost-demo.mp4` for the recorded demo
