import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Feed produktowy Lidia Kalita",
  description: "Feed IDOSell konwertowany na CSV i TSV dla ChatGPT.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
