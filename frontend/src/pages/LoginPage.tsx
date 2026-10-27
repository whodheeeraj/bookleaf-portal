import {
  ArrowRight,
  BookOpenCheck,
  Eye,
  EyeOff,
  Leaf,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  Sprout,
  UserRound,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";
import { buttonStyles } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError } from "@/lib/api";
import { DEMO_ACCOUNTS } from "@/lib/constants";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { cn } from "@/lib/utils";

export function LoginPage() {
  useDocumentTitle("Sign in");
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runLogin(nextEmail: string, nextPassword: string) {
    setError(null);
    setPending(nextEmail);
    try {
      const user = await login(nextEmail, nextPassword);
      const from = (location.state as { from?: string } | null)?.from;
      const fallback = user.role === "ADMIN" ? "/admin" : "/app";
      const target =
        from && (user.role === "ADMIN" ? from.startsWith("/admin") : from.startsWith("/app"))
          ? from
          : fallback;
      navigate(target, { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Sign in failed. Check your connection and try again.",
      );
      setPending(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter your email and password to continue.");
      return;
    }
    await runLogin(email.trim(), password);
  }

  return (
    <div className="min-h-screen bg-paper lg:grid lg:grid-cols-[1.02fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-forest-950 px-12 py-10 text-cream lg:flex lg:flex-col xl:px-16">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full border border-gold-300/10" />
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full border border-gold-300/10" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-64 w-full bg-gradient-to-t from-forest-950 to-transparent" />
        <div className="paper-grid pointer-events-none absolute inset-0 opacity-[0.14]" />

        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-300 text-forest-950">
            <Sprout size={24} strokeWidth={2.2} />
          </span>
          <div>
            <p className="font-display text-xl font-semibold leading-none">BookLeaf</p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.22em] text-forest-300">
              Author support & communication
            </p>
          </div>
        </div>

        <div className="relative my-auto max-w-xl py-16">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-gold-300/25 bg-gold-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-gold-200">
            <Sparkles size={12} />
            Context-aware support
          </p>
          <h1 className="font-display text-[2.9rem] leading-[1.08] tracking-tight xl:text-[3.3rem]">
            Every author question,
            <br />
            <span className="text-gold-300">answered with context.</span>
          </h1>
          <p className="mt-6 max-w-md text-sm leading-7 text-forest-200/85">
            One desk for royalty queries, print defects, ISBN corrections and production updates.
            BookLeaf&apos;s support team sees the author, the book and the policy before they type a
            word.
          </p>

          <div className="mt-12 grid max-w-md grid-cols-3 gap-4 border-t border-cream/10 pt-7">
            {[
              { value: "10", label: "Authors", icon: UserRound },
              { value: "18", label: "Titles", icon: BookOpenCheck },
              { value: "4", label: "Live requests", icon: Leaf },
            ].map(({ value, label, icon: Icon }) => (
              <div key={label}>
                <Icon size={15} className="mb-2 text-gold-300/80" />
                <p className="font-display text-2xl font-semibold text-cream">{value}</p>
                <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-forest-300">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-start gap-3 rounded-2xl border border-cream/10 bg-cream/[0.04] p-4">
          <LockKeyhole size={16} className="mt-0.5 shrink-0 text-gold-300" />
          <p className="text-[11px] leading-relaxed text-forest-200/80">
            Internal notes and AI drafts are stripped server-side. Authors only ever see their own
            requests and the public conversation.
          </p>
        </div>
      </aside>

      <section className="flex min-h-screen flex-col px-5 py-7 sm:px-10 lg:px-14 xl:px-20">
        <div className="flex items-center justify-between lg:justify-end">
          <div className="flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-forest-900 text-gold-300">
              <Sprout size={19} />
            </span>
            <div>
              <p className="font-display text-base font-semibold leading-none text-ink">BookLeaf</p>
              <p className="mt-1 text-[9px] font-medium uppercase tracking-[0.18em] text-stone-500">
                Author support
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-stone-500">
            <ShieldCheck size={14} className="text-forest-600" />
            Demo environment
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <div className="animate-slide-up">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-forest-600">
              Welcome back
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Sign in to BookLeaf</h2>
            <p className="mt-2 text-sm leading-relaxed text-stone-500">
              Choose a demo profile to explore the portal, or use your own credentials.
            </p>
          </div>

          <div className="mt-7">
            <div className="mb-2.5 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-500">
                One-click demo
              </p>
              <span className="text-[10px] text-stone-400">password: password123</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {DEMO_ACCOUNTS.map((account) => {
                const isAdmin = account.role === "ADMIN";
                const busy = pending === account.email;
                return (
                  <button
                    key={account.email}
                    type="button"
                    disabled={pending !== null}
                    onClick={() => void runLogin(account.email, account.password)}
                    className={cn(
                      "focus-ring group relative overflow-hidden rounded-xl border bg-white p-3 text-left shadow-sm transition",
                      isAdmin
                        ? "border-forest-200 hover:border-forest-400 hover:bg-forest-50/40"
                        : "border-stone-200 hover:border-gold-300 hover:bg-gold-50/30",
                      pending !== null && !busy && "opacity-60",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-md",
                          isAdmin
                            ? "bg-forest-100 text-forest-700"
                            : "bg-gold-100 text-gold-700",
                        )}
                      >
                        {isAdmin ? <ShieldCheck size={13} /> : <UserRound size={13} />}
                      </span>
                      <span className="text-xs font-semibold text-ink">{account.name}</span>
                      {busy ? <Spinner className="ml-auto h-3 w-3 text-forest-600" /> : null}
                      {!busy ? (
                        <ArrowRight
                          size={13}
                          className="ml-auto text-stone-300 transition group-hover:translate-x-0.5 group-hover:text-forest-500"
                        />
                      ) : null}
                    </div>
                    <p className="mt-1.5 pl-8 text-[10px] leading-snug text-stone-500">
                      {account.context}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-stone-200" />
            <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-stone-400">
              or sign in manually
            </span>
            <span className="h-px flex-1 bg-stone-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {error ? (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-medium leading-relaxed text-rose-700"
              >
                {error}
              </div>
            ) : null}

            <Field label="Email address" htmlFor="email">
              <div className="relative">
                <Mail
                  size={15}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
                />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@bookleaf.com"
                  className="pl-10"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </Field>

            <Field label="Password" htmlFor="password">
              <div className="relative">
                <LockKeyhole
                  size={15}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
                />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="pl-10 pr-11"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-ink"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </Field>

            <button
              type="submit"
              disabled={pending !== null}
              className={buttonStyles({ size: "lg", className: "w-full" })}
            >
              {pending && !DEMO_ACCOUNTS.some((account) => account.email === pending) ? (
                <Spinner className="h-4 w-4" />
              ) : null}
              Sign in
              <ArrowRight size={15} />
            </button>
          </form>

          <p className="mt-7 text-center text-[11px] leading-relaxed text-stone-400">
            Seeded demo data only — no real author information is stored in this environment.
          </p>
        </div>
      </section>
    </div>
  );
}
