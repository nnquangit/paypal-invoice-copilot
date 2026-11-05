# Invoice Copilot explainer (Remotion)

1920×1080 · 30 fps · ~75 s composition `InvoiceCopilotExplainer`.

```bash
cd video
npm install
npm run dev          # Studio
npx remotion render InvoiceCopilotExplainer ../out/invoice-copilot-explainer.mp4
npx remotion still InvoiceCopilotExplainer ../out/invoice-copilot-explainer-poster.png --frame=45
```

On the agent box, rendered artifacts are written to `/workspace/out/`.
This folder is excluded from the Next.js / root TypeScript build.
