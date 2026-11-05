# Setup guide

## Demo mode (no keys)

```bash
git clone https://github.com/nnquangit/paypal-invoice-copilot.git
cd paypal-invoice-copilot
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Try:

> Invoice Acme Corp $500 for logo design, due in 14 days, remind them in 3 days if unpaid

Confirm the send card. The invoice desk updates immediately.

```bash
npm test
npm run build
```

## Live PayPal sandbox + LLM

1. Copy env: `cp .env.example .env.local`
2. Fill the variables below
3. Restart `npm run dev`

| Env var | Required for | Where to get it |
| --- | --- | --- |
| `PAYPAL_CLIENT_ID` | Live PayPal calls | [PayPal Developer Dashboard → Sandbox apps](https://developer.paypal.com/dashboard/applications/sandbox) |
| `PAYPAL_CLIENT_SECRET` | Live PayPal calls | Same page → Secret |
| `PAYPAL_ENVIRONMENT` | Live PayPal calls | `sandbox` for the hackathon |
| `LLM_API_KEY` | Live LLM agent | [Groq](https://console.groq.com/keys), [OpenRouter](https://openrouter.ai/keys), or [Google AI Studio](https://aistudio.google.com/apikey) |
| `LLM_BASE_URL` | Live LLM agent | Groq: `https://api.groq.com/openai/v1` |
| `LLM_MODEL` | Live LLM agent | e.g. `llama-3.3-70b-versatile` |

Without those keys the app stays in polished **demo mode** (built-in demo agent + mock PayPal store).

## Docs portal

From the repo root:

```bash
python3 -m http.server 4590
```

Open [http://127.0.0.1:4590/docs/](http://127.0.0.1:4590/docs/).

## Deploy

- **Vercel:** import the repo, set the env vars, deploy (`vercel.json` included).
- **Render:** use `render.yaml` and paste the same secrets.
