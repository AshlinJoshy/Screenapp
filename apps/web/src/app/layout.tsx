import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AdScreen — Digital Signage Marketplace",
  description: "Connect screen owners with advertisers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
