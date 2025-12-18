import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Interview Editor",
  description: "リアルタイムインタビューエディター - Phase 0",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
