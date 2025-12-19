import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Interview Editor",
  description: "リアルタイムインタビューエディター - Phase 0",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
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
