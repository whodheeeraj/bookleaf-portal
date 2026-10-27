import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { TicketCategory, TicketFilters, TicketPriority, TicketStatus } from "@/lib/types";

export const queryKeys = {
  health: ["health"] as const,
  books: (authorId?: string) => ["books", authorId ?? "me"] as const,
  tickets: (filters: TicketFilters) => ["tickets", filters] as const,
  ticket: (id: string) => ["ticket", id] as const,
  stats: ["admin", "stats"] as const,
  authors: ["admin", "authors"] as const,
  aiHealth: ["admin", "ai-health"] as const,
};

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: () => api.health(),
    staleTime: 60_000,
    retry: 0,
  });
}

export function useBooks(authorId?: string) {
  return useQuery({
    queryKey: queryKeys.books(authorId),
    queryFn: () => api.books(authorId),
    staleTime: 60_000,
  });
}

export function useTickets(filters: TicketFilters = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.tickets(filters),
    queryFn: () => api.tickets(filters),
    enabled,
    placeholderData: keepPreviousData,
    // SSE is the primary update path; this keeps lists fresh if the stream is
    // blocked by a proxy or temporarily offline.
    refetchInterval: 30_000,
  });
}

export function useTicket(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.ticket(id ?? "missing"),
    queryFn: () => api.ticket(id!),
    enabled: Boolean(id),
    refetchInterval: 30_000,
  });
}

export function useAdminStats(enabled = true) {
  return useQuery({
    queryKey: queryKeys.stats,
    queryFn: () => api.adminStats(),
    enabled,
  });
}

export function useAuthors(enabled = true) {
  return useQuery({
    queryKey: queryKeys.authors,
    queryFn: () => api.authors(),
    enabled,
    staleTime: 60_000,
  });
}

export function useAiHealth(enabled = true) {
  return useQuery({
    queryKey: queryKeys.aiHealth,
    queryFn: () => api.aiHealth(),
    enabled,
    staleTime: 30_000,
  });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createTicket,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
}

export function useUpdateTicket(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      status?: TicketStatus;
      category?: TicketCategory;
      priority?: TicketPriority;
      assigned_admin_id?: string | null;
    }) => api.updateTicket(id, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.ticket(id), updated);
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats });
      void queryClient.invalidateQueries({ queryKey: queryKeys.authors });
    },
  });
}

export function useAddMessage(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { content: string; is_internal_note?: boolean }) =>
      api.addMessage(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ticket(id) });
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats });
    },
  });
}

export function useRegenerateDraft(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { category?: TicketCategory; instruction?: string }) =>
      api.regenerateDraft(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ticket(id) });
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}
