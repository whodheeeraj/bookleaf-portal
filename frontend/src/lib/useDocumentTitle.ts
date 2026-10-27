import { useEffect } from "react";

/** Keep `document.title` correct on public routes that live outside the AppShell. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · BookLeaf`;
  }, [title]);
}
