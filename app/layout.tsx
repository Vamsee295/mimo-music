import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Anton, Barlow_Condensed, Caveat, Inter, JetBrains_Mono } from "next/font/google";
import { PlayerBar } from "@/components/PlayerBar";
import { Boot, Sidebar, TabBar } from "@/components/Nav";
import { Toaster } from "@/components/Swipe";
import { AskDialog } from "@/components/Ask";
import { PageTransition } from "@/components/PageTransition";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const anton = Anton({ variable: "--font-anton", subsets: ["latin"], weight: "400" });
const barlow = Barlow_Condensed({ variable: "--font-barlow", subsets: ["latin"], weight: ["600", "700"] });
const caveat = Caveat({ variable: "--font-caveat", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-mono-jb", subsets: ["latin"] });
const fonts = [inter, anton, barlow, caveat, mono].map((f) => f.variable).join(" ");

export const metadata: Metadata = {
  title: "Mimo",
  description: "Music, everywhere. Free.",
};

export const viewport: Viewport = {
  themeColor: "#f5efe6",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fonts} theme-editorial h-full antialiased`}>
      <body className="flex h-full">
        <Boot />
        <Suspense>
          <Sidebar />
        </Suspense>
        <main className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-40 pt-[max(1.25rem,env(safe-area-inset-top))] md:px-8 md:pb-28 md:pt-8">
          <Suspense>
            <PageTransition>{children}</PageTransition>
          </Suspense>
        </main>
        <PlayerBar />
        <Toaster />
        <AskDialog />
        <Suspense>
          <TabBar />
        </Suspense>
      </body>
    </html>
  );
}
