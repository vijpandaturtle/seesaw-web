import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { Masthead } from "@/components/shell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Seesaw · Research Jobs",
    template: "%s · Seesaw",
  },
  description:
    "Dashboard for Seesaw — automated mechanistic interpretability research",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-zinc-950 text-zinc-100">
        <Masthead />
        <div className="flex-1">{children}</div>
        <footer className="border-t border-zinc-800/80 py-5">
          <p className="mx-auto max-w-5xl px-6 text-xs text-zinc-600">
            Scout plans · Lens experiments · Quill critiques
          </p>
        </footer>
      </body>
    </html>
  );
}
