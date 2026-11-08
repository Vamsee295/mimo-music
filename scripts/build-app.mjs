// Builds the Android app.
//   npm run build:app   static export to out/ + copy into the Android project (`cap sync`)
//   npm run apk         the above + an installable debug APK (android/app/build/outputs/apk/debug/)
// Works on Windows, macOS and Linux (no inline `VAR=1 cmd` syntax in npm scripts).
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const run = (cmd, opts = {}) => execSync(cmd, { stdio: "inherit", ...opts, env: { ...process.env, ...opts.env } });

run("npx next build", { env: { MIMO_EXPORT: "1" } });
run("npx cap sync android");

if (process.argv.includes("--apk")) {
  // full path to the Gradle wrapper: some Windows setups don't run commands from the current folder
  const gradlew = resolve("android", process.platform === "win32" ? "gradlew.bat" : "gradlew");
  run(`"${gradlew}" assembleDebug`, { cwd: "android" });
  console.log("\nAPK: android/app/build/outputs/apk/debug/app-debug.apk — copy it to your phone and open it to install.");
} else {
  console.log("\nDone. `npm run apk` builds the APK, or open Android Studio with `npx cap open android`.");
}
