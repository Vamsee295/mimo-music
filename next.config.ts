import type { NextConfig } from "next";

// The Android app (Capacitor) ships the site as plain files inside the APK: `npm run build:app` sets
// MIMO_EXPORT=1 to write them to out/. The website build (Vercel) is unchanged.
const appExport = process.env.MIMO_EXPORT === "1";

const nextConfig: NextConfig = {
  // distDir "out": in export mode the build folder *is* the exported site, so it lands where Capacitor
  // reads it (capacitor.config.ts webDir), and building the APK never touches `next dev`'s .next/
  ...(appExport ? { output: "export" as const, trailingSlash: true, distDir: "out" } : {}),
  // static export can't prerender partially (PPR), so the app build turns these off; Mimo uses no "use cache"
  cacheComponents: !appExport,
  devIndicators: false, // the dev badge sat on top of the sidebar Account link
  partialPrefetching: !appExport,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
