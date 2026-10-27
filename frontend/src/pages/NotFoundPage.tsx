import { ArrowLeft, Compass } from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";
import { BrandMark } from "@/components/ui/BrandMark";
import { buttonStyles } from "@/components/ui/Button";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

export function NotFoundPage() {
  useDocumentTitle("Page not found");
  const { user } = useAuth();
  const home = user ? (user.role === "ADMIN" ? "/admin" : "/app") : "/login";

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-md rounded-3xl border border-stone-200/80 bg-cream p-8 text-center shadow-card">
        <BrandMark className="mx-auto h-12 w-12" />
        <p className="mt-5 font-display text-6xl font-semibold tracking-tight text-forest-600">404</p>
        <h1 className="mt-2 text-xl font-semibold text-ink">This page has gone off-script</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-stone-500">
          The link may be out of date, or the page belongs to a different workspace. Head back to
          your BookLeaf desk and pick up where you left off.
        </p>
        <Link to={home} className={buttonStyles({ className: "mt-6 w-full" })}>
          {user ? <ArrowLeft size={15} /> : <Compass size={15} />}
          {user ? "Back to my workspace" : "Go to sign in"}
        </Link>
      </div>
    </div>
  );
}
