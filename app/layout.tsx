import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Anton, Barlow_Condensed, Caveat, Inter, JetBrains_Mono } from "next/font/google";
import { PlayerBar } from "@/components/PlayerBar";
import { Boot, Sidebar, TabBar } from "@/components/Nav";
import { Toaster } from "@/components/Swipe";
import { AskDialog } from "@/components/Ask";
import { Splash } from "@/components/Splash";
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
  manifest: "/manifest.webmanifest", // a static file (public/), so it works in the APK's static export too
};

export const viewport: Viewport = {
  themeColor: "#f5efe6",
  viewportFit: "cover",
};

// Runs before the first paint: apply the saved theme and accent colour now, so the splash (and the app) never flash the
// wrong colours while JavaScript loads. <Boot> keeps it in sync afterwards. Static string, no user input.
const THEME_SCRIPT = `try{var s=JSON.parse(localStorage.getItem("library")||"{}").state.settings,t=s.theme;var h=document.documentElement;h.dataset.theme=t||"editorial";if(s.reduceMotion)h.classList.add("reduce-motion");var a=s.accent||"";if(/^#[0-9a-f]{6}$/i.test(a)){var L=[1,3,5].map(function(i){var c=parseInt(a.slice(i,i+2),16)/255;return c<=.03928?c/12.92:Math.pow((c+.055)/1.055,2.4)}),l=.2126*L[0]+.7152*L[1]+.0722*L[2];h.style.setProperty("--accent",t==="dark"&&l<.12?"color-mix(in oklab, "+a+" 35%, #f5efe6)":t!=="dark"&&l>.6?"color-mix(in oklab, "+a+" 55%, #191614)":a)}if(t==="dark"){h.classList.replace("theme-editorial","theme-dark");document.querySelector('meta[name="theme-color"]')?.setAttribute("content","#121110")}}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: THEME_SCRIPT may swap the theme class before React hydrates
    <html lang="en" className={`${fonts} theme-editorial h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex h-full">
        <Splash />
        <Boot />
        <Suspense>
          <Sidebar />
        </Suspense>
        <main className="relative flex-1 overflow-y-auto overflow-x-hidden px-4 pb-40 pt-[max(1.25rem,env(safe-area-inset-top))] md:px-8 md:pb-28 md:pt-8">
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
