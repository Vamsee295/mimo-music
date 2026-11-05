"use client";
import { useRef, useState, type ReactNode } from "react";
import { create } from "zustand";
import { Icon, type IconName } from "./Icon";

const TRIGGER = 90; // px of drag needed to fire the action
const START = 10; // px before we decide it's a sideways drag (not a tap or a scroll)

/** Drag a row sideways to act on it (Spotify/Apple-style swipe actions). Works with mouse and touch.
 *  Vertical scrolling and taps are left alone: only a clearly horizontal drag engages. */
export function Swipe({
  dir,
  label,
  icon,
  tone,
  onSwipe,
  children,
}: {
  dir: "right" | "left";
  label: string;
  icon: IconName;
  tone: "note" | "accent";
  onSwipe: () => void;
  children: ReactNode;
}) {
  const row = useRef<HTMLDivElement>(null);
  const g = useRef({ x: 0, y: 0, id: -1, dragging: false, dead: false, dx: 0, armed: false });
  const justDragged = useRef(false);
  const [armed, setArmed] = useState(false);
  const [active, setActive] = useState(false);
  const sign = dir === "right" ? 1 : -1;

  const move = (dx: number, animate: boolean) => {
    const el = row.current;
    if (!el) return;
    el.style.transition = animate ? "transform 0.28s cubic-bezier(0.22,1,0.36,1)" : "none";
    el.style.transform = `translate3d(${dx}px,0,0)`;
  };

  const end = () => {
    const s = g.current;
    if (s.dragging) {
      justDragged.current = true; // swallow the click that follows the drag
      setTimeout(() => (justDragged.current = false), 0);
      if (s.armed) {
        move(sign * (row.current?.offsetWidth ?? 400), true); // fly out…
        setTimeout(() => {
          onSwipe();
          move(0, false); // …then snap home for the next swipe
          setActive(false);
          setArmed(false);
        }, 220);
      } else {
        move(0, true);
        setActive(false);
        setArmed(false);
      }
    }
    s.dragging = false;
    s.dead = false;
    s.id = -1;
  };

  return (
    <div className="relative overflow-hidden">
      {/* action revealed behind the row */}
      <div
        aria-hidden
        className={`absolute inset-0 flex items-center gap-2 px-5 transition-colors ${dir === "right" ? "justify-start" : "justify-end"} ${
          active ? (armed ? (tone === "note" ? "bg-note text-paper" : "bg-accent text-paper") : "bg-ink/10 text-ink/60") : "opacity-0"
        }`}
      >
        <Icon name={icon} className={`size-5 transition-transform ${armed ? "scale-125" : ""}`} />
        <span className="label-cond text-[15px]">{label}</span>
      </div>

      <div
        ref={row}
        className="relative touch-pan-y bg-paper"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          g.current = { x: e.clientX, y: e.clientY, id: e.pointerId, dragging: false, dead: false, dx: 0, armed: false };
        }}
        onPointerMove={(e) => {
          const s = g.current;
          if (s.id !== e.pointerId || s.dead) return;
          const dx = e.clientX - s.x;
          const dy = e.clientY - s.y;
          if (!s.dragging) {
            if (Math.abs(dy) > START && Math.abs(dy) > Math.abs(dx)) return void (s.dead = true); // a scroll
            if (Math.abs(dx) < START || Math.sign(dx) !== sign) return;
            s.dragging = true;
            setActive(true);
            // keep getting moves if the pointer leaves the row; can throw if the pointer already ended
            // (fast flick, or synthetic events) — the swipe still works without capture, so ignore that
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {}
          }
          // follow the finger in the allowed direction; resist past the trigger point
          const d = Math.max(0, dx * sign);
          const shown = d <= TRIGGER ? d : TRIGGER + (d - TRIGGER) * 0.35;
          s.dx = shown * sign;
          move(s.dx, false);
          const now = d >= TRIGGER;
          if (now !== s.armed) {
            s.armed = now;
            setArmed(now);
            if (now) navigator.vibrate?.(12);
          }
        }}
        onPointerUp={end}
        onPointerCancel={end}
        // images/links inside would start the browser's own drag-and-drop and cancel the swipe
        onDragStart={(e) => e.preventDefault()}
        onClickCapture={(e) => {
          if (justDragged.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ── tiny toast for confirming swipe actions ──
const useToast = create<{ msg: string; n: number; show: (m: string) => void }>((set) => ({
  msg: "",
  n: 0,
  show: (msg) => set((s) => ({ msg, n: s.n + 1 })),
}));
export const toast = (m: string) => useToast.getState().show(m);

export function Toaster() {
  const { msg, n } = useToast();
  const [hidden, setHidden] = useState<number>(0);
  if (!msg || hidden === n) return null;
  return (
    <div
      key={n}
      role="status"
      onAnimationEnd={() => setHidden(n)}
      className="toast brut label-cond pointer-events-none fixed left-1/2 top-4 z-[70] -translate-x-1/2 rounded-full bg-ink px-5 py-2 text-[15px] text-paper"
    >
      {msg}
    </div>
  );
}
