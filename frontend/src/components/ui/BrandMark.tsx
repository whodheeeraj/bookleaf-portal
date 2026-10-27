import { cn } from "@/lib/utils";

/**
 * BookLeaf brand mark: a coral tile with a white diagonal slash.
 * The coral is hard-coded so it stays on-brand regardless of surrounding text
 * colour (sidebar, login hero, light cards, favicon).
 */
export function BrandMark({
  className,
  title = "BookLeaf",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label={title}
      className={cn("shrink-0", className)}
    >
      <rect width="48" height="48" rx="9" fill="#F26979" />
      <path
        d="M11 37 37 11"
        stroke="#FFFFFF"
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  );
}
