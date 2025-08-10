"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

type DialogTone = "default" | "info" | "success" | "warning" | "danger";

type BaseDialogOptions = {
  title?: string;
  description?: string;
  tone?: DialogTone;
};

type ConfirmOptions = BaseDialogOptions & {
  confirmText?: string;
  cancelText?: string;
};

type NotifyOptions = BaseDialogOptions & {
  okText?: string;
};

type DialogContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  notify: (options: NotifyOptions) => Promise<void>;
};

const defaultDialogValue: DialogContextValue = {
  confirm: async () => false,
  notify: async () => { /* no-op */ },
};

const DialogContext = createContext<DialogContextValue>(defaultDialogValue);

type ActiveDialog =
  | { type: "confirm"; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { type: "notify"; options: NotifyOptions; resolve: () => void }
  | null;

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [active, setActive] = useState<ActiveDialog>(null);
  const mountedRef = useRef(true);

  const close = useCallback(() => setActive(null), []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setActive({ type: "confirm", options, resolve });
    });
  }, []);

  const notify = useCallback((options: NotifyOptions) => {
    return new Promise<void>((resolve) => {
      setActive({ type: "notify", options, resolve });
    });
  }, []);

  const value = useMemo(() => ({ confirm, notify }), [confirm, notify]);

  const toneStyles = (tone: DialogTone = "default") => {
    switch (tone) {
      case "danger":
        return {
          ring: "ring-red-400/30",
          headerBg: "bg-red-500/10",
          title: "text-red-200",
          icon: "text-red-300",
          confirmBtn: "bg-red-600 hover:bg-red-700",
        };
      case "warning":
        return {
          ring: "ring-amber-400/30",
          headerBg: "bg-amber-500/10",
          title: "text-amber-200",
          icon: "text-amber-300",
          confirmBtn: "bg-amber-600 hover:bg-amber-700",
        };
      case "success":
        return {
          ring: "ring-emerald-400/30",
          headerBg: "bg-emerald-500/10",
          title: "text-emerald-200",
          icon: "text-emerald-300",
          confirmBtn: "bg-emerald-600 hover:bg-emerald-700",
        };
      case "info":
        return {
          ring: "ring-sky-400/30",
          headerBg: "bg-sky-500/10",
          title: "text-sky-200",
          icon: "text-sky-300",
          confirmBtn: "bg-sky-600 hover:bg-sky-700",
        };
      default:
        return {
          ring: "ring-white/10",
          headerBg: "bg-white/5",
          title: "text-white/90",
          icon: "text-white/70",
          confirmBtn: "bg-white/10 hover:bg-white/20",
        };
    }
  };

  return (
    <DialogContext.Provider value={value}>
      {children}
      {active && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            onClick={() => {
              if (active.type === "confirm") {
                active.resolve(false);
              } else {
                active.resolve();
              }
              close();
            }}
            aria-hidden
          />

          {/* Dialog */}
          <div
            role="dialog"
            aria-modal="true"
            className={`relative w-[92%] max-w-md rounded-2xl border border-white/10 glass-soft shadow-2xl ring-1 ${toneStyles(active.options.tone).ring}`}
          >
            <div className={`px-4 py-3 rounded-t-2xl border-b border-white/10 ${toneStyles(active.options.tone).headerBg}`}>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${toneStyles(active.options.tone).icon}`}></span>
                <div className={`text-sm font-semibold ${toneStyles(active.options.tone).title}`}>
                  {active.options.title || (active.type === "confirm" ? "Confirm" : "Notice")}
                </div>
              </div>
            </div>
            <div className="px-4 py-3 text-sm text-white/90">
              {active.options.description}
            </div>
            <div className="px-4 py-3 flex items-center justify-end gap-2 border-t border-white/10 bg-black/20 rounded-b-2xl">
              {active.type === "confirm" ? (
                <>
                  <button
                    onClick={() => {
                      active.resolve(false);
                      close();
                    }}
                    className="px-3 py-1.5 rounded-lg text-sm border border-white/10 text-white/80 hover:bg-white/10"
                    autoFocus
                  >
                    {active.options.cancelText || "Cancel"}
                  </button>
                  <button
                    onClick={() => {
                      active.resolve(true);
                      close();
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm text-white ${toneStyles(active.options.tone).confirmBtn}`}
                  >
                    {active.options.confirmText || "Confirm"}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    active.resolve();
                    close();
                  }}
                  className="px-3 py-1.5 rounded-lg text-sm border border-white/10 text-white/90 hover:bg-white/10"
                  autoFocus
                >
                  {active.options.okText || "OK"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
};

export const useDialog = (): DialogContextValue => useContext(DialogContext);


