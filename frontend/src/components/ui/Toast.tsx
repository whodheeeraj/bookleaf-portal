import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

type Tone = "success" | "error" | "info";

interface ToastInput {
  title: string;
  description?: string;
  tone?: Tone;
}

interface ToastItem extends ToastInput {
  id: string;
  tone: Tone;
}

interface ToastContextValue {
  notify: (toast: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_META: Record<
  Tone,
  { icon: typeof CheckCircle2; wrapper: string; iconClass: string }
> = {
  success: {
    icon: CheckCircle2,
    wrapper: "border-forest-200 bg-white",
    iconClass: "text-forest-600",
  },
  error: {
    icon: AlertTriangle,
    wrapper: "border-rose-200 bg-white",
    iconClass: "text-rose-600",
  },
  info: {
    icon: Info,
    wrapper: "border-stone-200 bg-white",
    iconClass: "text-sky-600",
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    ({ title, description, tone = "success" }: ToastInput) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
      setToasts((current) => [...current.slice(-3), { id, title, description, tone }]);
      window.setTimeout(() => dismiss(id), 5200);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2">
        {toasts.map((toast) => {
          const meta = TONE_META[toast.tone];
          const Icon = meta.icon;
          return (
            <div
              key={toast.id}
              role="status"
              className={cn(
                "pointer-events-auto flex animate-slide-up items-start gap-3 rounded-xl border p-3.5 shadow-lift",
                meta.wrapper,
              )}
            >
              <Icon className={cn("mt-0.5 h-4.5 w-4.5 shrink-0", meta.iconClass)} size={18} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{toast.title}</p>
                {toast.description ? (
                  <p className="mt-0.5 text-xs leading-relaxed text-stone-600">
                    {toast.description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => dismiss(toast.id)}
                className="rounded-md p-1 text-stone-400 transition hover:bg-stone-100 hover:text-ink"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}
