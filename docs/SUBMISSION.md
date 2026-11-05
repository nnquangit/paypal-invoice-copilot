# Devpost submission text

Copy/paste into the Devpost “Enter a Submission” form. Keep English.

## Inspiration

Freelancers live in chat — Slack, email, iMessage — but billing still means hunting through the PayPal invoice UI. We wanted an agent that understands “bill Acme $500 for logo design, due in 14 days, remind them in 3 days” and turns it into real PayPal invoicing, with a human still in control of anything that contacts the client.

## What it does

**Invoice Copilot** is a chat-first PayPal agent for freelancers and small businesses:

- Creates PayPal invoice drafts from natural language
- Sends, reminds, and cancels invoices **only after UI confirmation**
- Lists invoices and summarizes who owes what
- Generates payment QR codes / links
- Shows a live invoice desk (unpaid, collected, drafts)
- Runs in polished **demo mode with zero credentials**, or live against PayPal sandbox + any OpenAI-compatible LLM

## How we built it

- **Next.js 15 App Router + TypeScript + Tailwind** for a polished product UI (chat + dashboard)
- **Vercel AI SDK** for tool-calling when an LLM key is present
- **Official `@paypal/agent-toolkit`** (AI SDK adapter) for Invoicing tools against the PayPal sandbox
- A **built-in demo agent** + in-memory mock PayPal store so judges can experience the full flow without signing up
- Confirmation API that gates send / remind / cancel (human-in-the-loop agentic commerce)
- Deploy configs for **Vercel** and **Render**

## Challenges we ran into

- Designing a safe agent: never auto-email clients — confirmation cards for every outbound action
- Keeping the experience excellent both with and without credentials (hackathon judges must be able to run it)
- Mapping messy natural language (amounts, due dates, reminder schedules, business names) onto PayPal invoice schemas
- Merging live toolkit tools with mock fallbacks without leaking secrets or breaking demos

## Accomplishments that we're proud of

- End-to-end agentic invoicing loop: chat → draft → confirm → send → remind → QR → summary
- Equal focus on **Design** and **Presentation** (judging criteria) — not just a CLI proof of concept
- Zero-config demo path that still feels like a product
- Clear credential checklist so going live on sandbox is a 5-minute job

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
- Vitest, Node.js 20+
- Vercel / Render

## Try it

1. `npm install && npm run dev` — demo mode, no keys
2. Add `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` / `LLM_API_KEY` from `.env.example` for live sandbox
3. See `docs/DEMO_SCRIPT.md` for the <3 minute video outline
