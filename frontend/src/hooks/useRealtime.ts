import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { getToken, streamUrl } from "@/lib/api";

export type LiveStatus = "connecting" | "live" | "offline";

const TICKET_EVENTS = ["connected", "ticket.created", "ticket.updated", "message.created"];

/**
 * Subscribes to the authenticated SSE stream and invalidates cached queries.
 * EventSource reconnects automatically; we surface connection health for the UI.
 */
export function useRealtime(enabled: boolean) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const seenConnected = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setStatus("offline");
      return;
    }
    const token = getToken();
    if (!token) {
      setStatus("offline");
      return;
    }

    let source: EventSource | null = null;
    try {
      source = new EventSource(streamUrl(token));
    } catch {
      setStatus("offline");
      return;
    }

    const refresh = (payload?: { ticket_id?: string }) => {
      setLastEventAt(new Date().toISOString());
      if (payload?.ticket_id) {
        void queryClient.invalidateQueries({ queryKey: ["ticket", payload.ticket_id] });
      }
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    };

    const onConnected = (event: MessageEvent) => {
      seenConnected.current = true;
      setStatus("live");
      try {
        const payload = JSON.parse(event.data) as { ticket_id?: string };
        refresh(payload);
      } catch {
        refresh();
      }
    };

    const onEvent = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as { ticket_id?: string };
        refresh(payload);
      } catch {
        refresh();
      }
    };

    source.addEventListener("connected", onConnected as EventListener);
    for (const name of TICKET_EVENTS.slice(1)) {
      source.addEventListener(name, onEvent as EventListener);
    }

    source.onopen = () => setStatus("live");
    source.onerror = () => {
      setStatus(seenConnected.current ? "offline" : "connecting");
    };

    return () => {
      source?.removeEventListener("connected", onConnected as EventListener);
      for (const name of TICKET_EVENTS.slice(1)) {
        source?.removeEventListener(name, onEvent as EventListener);
      }
      source?.close();
    };
  }, [enabled, queryClient]);

  return { status, lastEventAt };
}
