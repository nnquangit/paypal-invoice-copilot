import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PayPal Invoice Copilot",
  description:
    "Chat-based AI agent that creates, sends, reminds, and tracks PayPal invoices for freelancers and small businesses.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
