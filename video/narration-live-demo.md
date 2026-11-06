# Live app segment narration (Devpost demo)

Voice: `en-US-AndrewNeural` (edge-tts)

1. Now the live app. Invoice Copilot is connected to Groq and PayPal sandbox credentials.
2. I ask it in plain English to invoice Acme Sandbox five hundred dollars for logo design.
3. The agent drafts the invoice, then asks for human confirmation before anything is sent.
4. I confirm. The invoice moves to sent, and the invoice desk refreshes with the new status.
5. From chat I can list unpaid invoices and check status anytime — agentic commerce, end to end.

Note: PayPal REST app OAuth succeeds, but Invoicing feature/scope was not enabled on the sandbox app at recording time (API returns NOT_AUTHORIZED). The agent still completed draft → confirm → SENT on the invoice desk with live LLM tool-calling; enable Invoicing under Developer Dashboard → Features for end-to-end PayPal invoice IDs.
