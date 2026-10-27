import {
  BookOpen,
  ChevronRight,
  Inbox,
  LayoutDashboard,
  LibraryBig,
  LogOut,
  Menu,
  MessagesSquare,
  PlusCircle,
  Sparkles,
  Sprout,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";
import { Avatar } from "@/components/ui/Avatar";
import { useAdminStats, useHealth } from "@/hooks/queries";
import { useRealtime } from "@/hooks/useRealtime";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
}

const AUTHOR_NAV: NavItem[] = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/app/books", label: "My books", icon: LibraryBig },
  { to: "/app/tickets", label: "Support tickets", icon: MessagesSquare },
  { to: "/app/tickets/new", label: "New request", icon: PlusCircle },
];

const ADMIN_NAV: NavItem[] = [
  { to: "/admin", label: "Support queue", icon: Inbox, end: true },
  { to: "/admin/authors", label: "Authors", icon: Users },
];

function pageTitle(pathname: string, isAdmin: boolean): string {
  if (pathname === "/admin") return "Support queue";
  if (pathname.startsWith("/admin/tickets/")) return "Ticket workspace";
  if (pathname.startsWith("/admin/authors")) return "Author directory";
  if (pathname === "/app") return "Overview";
  if (pathname === "/app/books") return "My books";
  if (pathname === "/app/tickets/new") return "New request";
  if (pathname.startsWith("/app/tickets/")) return "Request details";
  if (pathname === "/app/tickets") return "Support tickets";
  return isAdmin ? "Support" : "Author portal";
}

function LiveChip({ status }: { status: "connecting" | "live" | "offline" }) {
  const meta = {
    live: { label: "Live", dot: "bg-forest-500", className: "text-forest-700" },
    connecting: { label: "Connecting", dot: "bg-gold-400 animate-pulse-soft", className: "text-gold-700" },
    offline: { label: "Polling", dot: "bg-stone-400", className: "text-stone-500" },
  }[status];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-[11px] font-semibold", meta.className)}
      title={
        status === "live"
          ? "Realtime updates connected"
          : status === "connecting"
            ? "Opening the realtime stream"
            : "Realtime unavailable — data refreshes on a timer"
      }
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const { data: health } = useHealth();
  const isAdmin = user?.role === "ADMIN";
  const { data: stats } = useAdminStats(isAdmin);
  const nav = isAdmin ? ADMIN_NAV : AUTHOR_NAV;
  const openCount = stats ? stats.open + stats.in_progress : null;

  return (
    <div className="flex h-full flex-col bg-forest-950 text-cream">
      <div className="flex items-center gap-3 px-5 pb-5 pt-6">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-300 text-forest-950 shadow-sm">
          <Sprout size={22} strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold leading-none tracking-tight">BookLeaf</p>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-forest-300">
            Author support
          </p>
        </div>
      </div>

      <nav className="mt-2 flex-1 space-y-1 px-3">
        <p className="px-3 pb-2 pt-3 text-[9px] font-bold uppercase tracking-[0.2em] text-forest-400/80">
          {isAdmin ? "Operations" : "Your workspace"}
        </p>
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition",
                  isActive
                    ? "bg-cream/10 text-cream shadow-[inset_0_0_0_1px_rgba(251,249,244,0.08)]"
                    : "text-forest-200/80 hover:bg-cream/5 hover:text-cream",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    size={17}
                    className={cn(
                      "shrink-0 transition",
                      isActive ? "text-gold-300" : "text-forest-400 group-hover:text-forest-200",
                    )}
                  />
                  <span className="flex-1">{item.label}</span>
                  {item.to === "/admin" && openCount ? (
                    <span className="rounded-full bg-gold-300/15 px-2 py-0.5 text-[10px] font-bold text-gold-200">
                      {openCount}
                    </span>
                  ) : null}
                  {isActive ? <ChevronRight size={13} className="text-forest-400" /> : null}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="mx-3 mb-3 rounded-xl border border-cream/10 bg-cream/[0.04] p-3">
        <div className="flex items-center gap-2">
          <Sparkles size={13} className="text-gold-300" />
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-forest-300">
            AI desk
          </p>
          <span
            className={cn(
              "ml-auto h-1.5 w-1.5 rounded-full",
              health ? "bg-emerald-400" : "bg-stone-500",
            )}
          />
        </div>
        <p className="mt-2 text-[11px] font-medium leading-snug text-cream">
          {health?.ai.mode === "llm" ? health.ai.model : "Deterministic rules engine"}
        </p>
        <p className="mt-0.5 text-[10px] leading-relaxed text-forest-300/80">
          {health?.ai.mode === "llm"
            ? `LLM triage · ${health.ai.fallback_enabled ? "fallback armed" : "single engine"}`
            : "No API key needed — demo-safe triage"}
        </p>
      </div>

      <div className="border-t border-cream/10 px-3 py-3">
        <div className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
          <Avatar name={user?.name ?? "BookLeaf"} seed={user?.id} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-cream">{user?.name}</p>
            <p className="truncate text-[10px] text-forest-300">
              {isAdmin ? "Support admin" : "Author account"}
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            title="Sign out"
            aria-label="Sign out"
            className="rounded-lg p-1.5 text-forest-300 transition hover:bg-cream/10 hover:text-cream"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppShell() {
  const { user } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const realtime = useRealtime(Boolean(user));
  const isAdmin = user?.role === "ADMIN";
  const isWorkspace = /^\/admin\/tickets\/[^/]+$/.test(location.pathname);
  const title = useMemo(() => pageTitle(location.pathname, Boolean(isAdmin)), [location.pathname, isAdmin]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.title = `${title} · BookLeaf`;
  }, [title]);

  return (
    <div className="min-h-screen bg-paper">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <SidebarContent />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-forest-950/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 animate-slide-up shadow-lift">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
              className="absolute right-3 top-3 rounded-lg p-1.5 text-forest-200 hover:bg-cream/10"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-stone-200/80 bg-paper/85 px-4 backdrop-blur-md sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="focus-ring -ml-1 rounded-lg p-2 text-stone-600 hover:bg-stone-200/60 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu size={19} />
          </button>
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <BookOpen size={15} className="hidden text-forest-600 sm:block" />
            <span className="truncate font-semibold text-ink">{title}</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <LiveChip status={realtime.status} />
            <span className="hidden h-5 w-px bg-stone-300 sm:block" />
            <span className="hidden rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-stone-500 ring-1 ring-inset ring-stone-200 sm:block">
              {isAdmin ? "Admin" : "Author"}
            </span>
            <Avatar name={user?.name ?? "BookLeaf"} seed={user?.id} size="sm" />
          </div>
        </header>

        <main
          className={cn(
            "animate-fade-in",
            isWorkspace ? "p-0" : "mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8",
          )}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
