// The "Share my Replay" image: a 1080x1350 card in Mimo's print style (accent colour, ink, cream), drawn on a
// canvas so it can go to the share sheet. Cover art is skipped: catalog images can't be read back off a canvas.
import type { replay } from "./replay";

type Data = ReturnType<typeof replay>;

const fit = (ctx: CanvasRenderingContext2D, text: string, max: number) => {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
};

export async function replayCard(period: string, data: Data): Promise<string> {
  const W = 1080, H = 1350;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue("--accent").trim() || "#c8603a";
  const display = getComputedStyle(document.querySelector(".display") ?? document.body).fontFamily || "Impact, sans-serif";
  const body = getComputedStyle(document.body).fontFamily || "sans-serif";
  await document.fonts?.ready;

  ctx.fillStyle = "#f5efe6";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, 330);

  ctx.fillStyle = "#f5efe6";
  ctx.font = `600 34px ${body}`;
  ctx.fillText(`MIMO · ${period.toUpperCase()}`, 72, 110);
  ctx.font = `120px ${display}`;
  ctx.fillText("MY REPLAY", 72, 250);

  // stats row
  const stats: [string, number][] = [["MINUTES", data.minutes], ["PLAYS", data.plays], ["ARTISTS", data.artists.length]];
  stats.forEach(([label, n], i) => {
    const x = 72 + i * 320;
    ctx.fillStyle = "#191614";
    ctx.font = `92px ${display}`;
    ctx.fillText(String(n), x, 470);
    ctx.font = `600 28px ${body}`;
    ctx.fillStyle = "rgba(25,22,20,0.6)";
    ctx.fillText(label, x, 515);
  });

  const list = (title: string, rows: [string, string][], y: number) => {
    ctx.fillStyle = "#191614";
    ctx.font = `60px ${display}`;
    ctx.fillText(title, 72, y);
    rows.forEach(([main, sub], i) => {
      const ry = y + 78 + i * 78;
      ctx.fillStyle = accent;
      ctx.font = `600 38px ${body}`;
      ctx.fillText(String(i + 1), 72, ry);
      ctx.fillStyle = "#191614";
      ctx.font = `600 38px ${body}`;
      ctx.fillText(fit(ctx, main, 640), 130, ry);
      ctx.fillStyle = "rgba(25,22,20,0.55)";
      ctx.font = `30px ${body}`;
      ctx.fillText(fit(ctx, sub, 240), 790, ry);
    });
  };
  list("TOP SONGS", data.songs.slice(0, 5).map((s) => [s.track.title, s.minutes ? `${s.minutes} min` : `${s.n} plays`]), 640);
  list("TOP ARTISTS", data.artists.slice(0, 3).map((a) => [a.name, a.minutes ? `${a.minutes} min` : `${a.n} plays`]), 1040);

  ctx.fillStyle = "rgba(25,22,20,0.45)";
  ctx.font = `28px ${body}`;
  ctx.fillText("made with Mimo", 72, H - 50);
  return c.toDataURL("image/png");
}
