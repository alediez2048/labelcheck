import type { Metadata } from "next";
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
        {children}
      </body>
    </html>
  );
}
