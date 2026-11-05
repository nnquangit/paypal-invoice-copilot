# Demo video script (< 3 minutes)

**Title suggestion:** Invoice Copilot — Agentic PayPal invoicing from chat  
**Target length:** 2:30–2:50  
**Visual:** App running in demo mode (or live sandbox if keys are set). Show chat on the left, invoice desk on the right.

---

## 0:00 – 0:20 · The problem

> Freelancers shouldn't need five clicks and a form to bill a client.
> Notes like “invoice Acme five hundred for the logo, due in two weeks, chase them if they don't pay” get lost in chat.
> Invoice Copilot turns that sentence into a real PayPal invoice.

*(Show empty-ish desk + welcome message.)*

## 0:20 – 1:10 · Create + confirm send

Type (or click the chip):

```
Invoice Acme Corp $500 for logo design, due in 14 days, remind them in 3 days if unpaid
```

> Watch the agent draft a PayPal invoice — recipient, amount, due date, reminder plan.
> Before anything leaves, it asks me to confirm. Human-in-the-loop for send, remind, and cancel.

Click **Confirm**.

> Sent. The invoice desk updates live — status SENT, amount on the unpaid total.

## 1:10 – 1:45 · Who owes what + QR

Type: `Who owes me money?`

> The agent summarizes outstanding receivables from PayPal.

Type: `Show QR for INV-1001` (use the invoice number just created if different).

> Instant payment QR / link — ready to drop into email, Slack, or a client portal.

## 1:45 – 2:20 · Remind & cancel safely

Type: `Remind Acme about their invoice` → Confirm.

> Reminder goes out through PayPal. Still confirmed by a human first.

Optionally: `Cancel invoice INV-…` → show the cancel confirm card → Cancel (don't destroy the happy path) or Confirm if you want to show cancellation.

## 2:20 – 2:50 · Why it matters / close

> Built with the official PayPal Agent Toolkit and a tool-calling LLM —
> or a built-in demo agent so judges can run it with zero credentials.
> Agentic commerce for the freelancers who keep the internet running.
> Invoice Copilot — PayPal AI Hackathon.

*(End on the UI with unpaid summary visible. Cut.)*

## B-roll / captions tips

- Overlay labels: “PayPal Agent Toolkit”, “Human confirmation”, “Demo mode / Sandbox”
- No background music with copyright
- Keep on-screen text large; speak clearly
