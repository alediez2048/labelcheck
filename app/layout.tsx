import type { Metadata } from "next";

import { QueueProvider } from "@/lib/queue/QueueProvider";

import "./globals.css";

export const metadata: Metadata = {
  title: "LabelCheck",
  description: "TTB COLA AI-enabled alcohol label verification",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {/*
         * The queue store lives at the root so the Agent shell
         * (/queue, /queue/[id]) and the Admin shell (/operations)
         * read and mutate the same session-bound state. NFR-4 still
         * holds — the provider is in-memory React state, reseeded
         * on every fresh tab.
         */}
        <QueueProvider>{children}</QueueProvider>
      </body>
    </html>
  );
}
