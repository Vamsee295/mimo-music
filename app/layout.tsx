import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist } from "next/font/google";
import { PlayerBar } from "@/components/PlayerBar";
import { Boot, Sidebar, TabBar } from "@/components/Nav";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Mimo",
  description: "Music, everywhere. Free.",
};

export const viewport: Viewport = {
  themeColor: "#000000",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="flex h-full">
        <Boot />
        <Suspense>
          <Sidebar />
        </Suspense>
        <main className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-40 pt-[max(1.25rem,env(safe-area-inset-top))] md:px-8 md:pb-28 md:pt-8">
          <Suspense>{children}</Suspense>
        </main>
        <PlayerBar />
        <Suspense>
          <TabBar />
        </Suspense>
      </body>
    </html>
  );
}
