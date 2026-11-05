"use client";
// In-app replacement for window.prompt / window.confirm (the browser's own boxes break the look).
import { useEffect, useRef } from "react";
import { create } from "zustand";

type Req = { title: string; value?: string; ok: string; danger?: boolean; done: (v: string | null) => void };
const useAsk = create<{ req: Req | null }>(() => ({ req: null }));

const open = (r: Omit<Req, "done">) =>
  new Promise<string | null>((done) => {
    useAsk.getState().req?.done(null); // a newer question replaces an open one
    useAsk.setState({ req: { ...r, done } });
  });

/** Text question → the trimmed answer, or null if cancelled/empty. */
export const askText = async (title: string, value = "", ok = "Save") => (await open({ title, value, ok }))?.trim() || null;
/** Yes/no question → true only if confirmed. */
export const askConfirm = async (title: string, ok = "Delete") => (await open({ title, ok, danger: true })) !== null;

export function AskDialog() {
  const req = useAsk((s) => s.req);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (req && !ref.current?.open) ref.current?.showModal();
  }, [req]);

  const finish = (v: string | null) => {
    req?.done(v);
    useAsk.setState({ req: null });
    ref.current?.close();
  };

  return (
    <dialog
      ref={ref}
      onCancel={(e) => (e.preventDefault(), finish(null))}
      onClick={(e) => e.target === e.currentTarget && finish(null)}
      className="ask brut m-auto w-[min(92vw,380px)] rounded-2xl bg-card p-0 text-ink backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      {req && (
        <form
          key={req.title + req.value}
          className="p-5"
          onSubmit={(e) => {
            e.preventDefault();
            finish(req.value === undefined ? "" : String(new FormData(e.currentTarget).get("v") ?? ""));
          }}
        >
          <p className="display mb-4 text-2xl">{req.title}</p>
          {req.value !== undefined && (
            <input
              autoFocus
              name="v"
              defaultValue={req.value}
              onFocus={(e) => e.target.select()}
              maxLength={80}
              className="mb-5 w-full rounded-xl border-2 border-[var(--line)] bg-paper px-3.5 py-2.5 text-base outline-none focus:border-[var(--accent)]"
            />
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => finish(null)} className="label-cond h-10 rounded-full border-2 border-[var(--line)] px-5 text-[15px]">
              Cancel
            </button>
            <button
              type="submit"
              className={`label-cond h-10 rounded-full border-2 border-[var(--ink)] px-5 text-[15px] text-paper ${req.danger ? "bg-red-600" : "bg-accent"}`}
            >
              {req.ok}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
