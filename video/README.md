# Invoice Copilot explainer (Remotion)

1920×1080 · 30 fps · ~65 s composition `InvoiceCopilotExplainer`  
English VO: `en-US-AndrewNeural` (edge-tts) · ambient pad synthesized with ffmpeg  
Script: [`narration.md`](narration.md) · assets: `public/audio/`

```bash
cd video
npm install
npm run dev          # Studio
npx remotion render InvoiceCopilotExplainer /workspace/out/invoice-copilot-explainer.mp4
npx remotion still InvoiceCopilotExplainer /workspace/out/invoice-copilot-explainer-poster.png --frame=45
```

Audio is AAC on render. Background music sits ~−20 dB under the voice.
This folder is excluded from the Next.js / root TypeScript build.
