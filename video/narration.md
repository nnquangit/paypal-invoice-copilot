# Invoice Copilot explainer — English narration

Composition: `InvoiceCopilotExplainer` · 1920×1080 · 30 fps  
Voice: `en-US-AndrewNeural` (edge-tts) · one MP3 per scene under `public/audio/`  
Audience: PayPal AI Hackathon judges on Devpost

Timing note: scene lengths are driven by measured VO duration + ~0.6–0.8s head/tail padding so animations finish cleanly. Total target **60–100s**.

| # | Scene | File | Approx. copy |
|---|-------|------|----------------|
| 1 | Title | `vo-01-title.mp3` | Meet Invoice Copilot… |
| 2 | Problem | `vo-02-problem.mp3` | Freelancers still lose time… |
| 3 | Solution | `vo-03-solution.mp3` | Invoice Copilot fixes that… |
| 4 | Flow | `vo-04-flow.mp3` | Here’s the path… |
| 5 | Stack | `vo-05-stack.mp3` | Built with Next.js… |
| 6 | Outro | `vo-06-outro.mp3` | Try demo mode… |

## Scripts

### 1 — Title
Meet Invoice Copilot — a chat-based agent that turns a plain-English request into a real PayPal invoice.

### 2 — Problem
Freelancers still lose hours digging through email for client details, rebuilding line items by hand, and chasing payment status across tools.

### 3 — Solution
Invoice Copilot fixes that. Chat once, review a confirmation card, then create and send through PayPal — sandbox or live.

### 4 — Flow
Here’s the path: you describe the job, the agent drafts the invoice, you confirm, PayPal creates and sends it, and the desk shows the link and status.

### 5 — Stack
It’s built with Next.js, a demo agent or LLM plus the PayPal Agent Toolkit, and human confirmation before every write.

### 6 — Outro
Try demo mode in under a minute — no PayPal keys required. Open the chat and ask for an invoice.

## Background music
`public/audio/bg-ambient.mp3` — locally synthesized ambient pad (ffmpeg), ~−20 dB under VO, fade in/out. Royalty-free (generated, not sampled).


## Measured timings (edge-tts `en-US-AndrewNeural`)

| Scene | VO length | Scene length |
|-------|-----------|--------------|
| Title | 7.03s | 9.0s (270f) |
| Problem | 8.98s | 11.0s (330f) |
| Solution | 8.83s | 11.0s (330f) |
| Flow | 9.55s | 12.0s (360f) |
| Stack | 8.93s | 11.0s (330f) |
| Outro | 6.84s | 11.0s (330f) |
| **Total** | ~50.2s VO | **65.0s** (1950f) |

VO lead-in: 0.6s per scene. BG: `bg-ambient.mp3` at volume 0.45 (~−20 dB vs VO).

Burned-in captions: OFF (voiceover + bg music only; no hardsubs).
