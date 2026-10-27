import type {
  AdminStats,
  AiHealth,
  AuthorOverview,
  Book,
  DraftResponse,
  HealthResponse,
  LoginResponse,
  Message,
  Page,
  TicketCategory,
  TicketCreated,
  TicketDetail,
  TicketFilters,
  TicketPriority,
  TicketStatus,
  TicketSummary,
  User,
} from "@/lib/types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/+$/, "");

export const TOKEN_KEY = "bookleaf.token";
export const USER_KEY = "bookleaf.user";
export const UNAUTHORIZED_EVENT = "bookleaf:unauthorized";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setSession(token: string, user: User): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
  timeoutMs?: number;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, timeoutMs = 45000 } = options;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(408, "timeout", "The request took too long. Please try again.");
    }
    throw new ApiError(
      0,
      "network_error",
      "Cannot reach the BookLeaf API. Check that the backend is running.",
    );
  } finally {
    window.clearTimeout(timer);
  }

  if (!response.ok) {
    let code = `http_${response.status}`;
    let message = "Something went wrong. Please try again.";
    let details: unknown;
    try {
      const payload = (await response.json()) as {
        error?: { code?: string; message?: string; details?: unknown };
      };
      code = payload.error?.code || code;
      message = payload.error?.message || message;
      details = payload.error?.details;
    } catch {
      // Non-JSON error response - keep the generic message.
    }
    if (response.status === 401 && auth) {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(response.status, code, message, details);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    search.set(key, String(value));
  }
  const suffix = search.toString();
  return suffix ? `?${suffix}` : "";
}

export const api = {
  login(email: string, password: string): Promise<LoginResponse> {
    return request<LoginResponse>("/auth/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    });
  },

  me(): Promise<User> {
    return request<User>("/auth/me");
  },

  health(): Promise<HealthResponse> {
    return request<HealthResponse>("/health", { auth: false, timeoutMs: 8000 });
  },

  books(authorId?: string): Promise<Book[]> {
    return request<Book[]>(`/books${authorId ? `?author_id=${encodeURIComponent(authorId)}` : ""}`);
  },

  tickets(filters: TicketFilters = {}): Promise<Page<TicketSummary>> {
    const {
      status,
      category,
      priority,
      date_from,
      date_to,
      q,
      unassigned,
      mine,
      page = 1,
      page_size = 20,
    } = filters;
    return request<Page<TicketSummary>>(
      `/tickets${query({
        status,
        category,
        priority,
        date_from,
        date_to,
        q,
        unassigned,
        mine,
        page,
        page_size,
      })}`,
    );
  },

  ticket(id: string): Promise<TicketDetail> {
    return request<TicketDetail>(`/tickets/${id}`);
  },

  createTicket(payload: {
    book_id?: string | null;
    subject: string;
    description: string;
    attachment_name?: string | null;
  }): Promise<TicketCreated> {
    return request<TicketCreated>("/tickets", { method: "POST", body: payload });
  },

  updateTicket(
    id: string,
    payload: {
      status?: TicketStatus;
      category?: TicketCategory;
      priority?: TicketPriority;
      assigned_admin_id?: string | null;
    },
  ): Promise<TicketDetail> {
    return request<TicketDetail>(`/tickets/${id}`, { method: "PATCH", body: payload });
  },

  addMessage(
    id: string,
    payload: { content: string; is_internal_note?: boolean },
  ): Promise<Message> {
    return request<Message>(`/tickets/${id}/messages`, { method: "POST", body: payload });
  },

  regenerateDraft(
    id: string,
    payload: { category?: TicketCategory; instruction?: string },
  ): Promise<DraftResponse> {
    return request<DraftResponse>(`/tickets/${id}/regenerate-draft`, {
      method: "POST",
      body: payload,
      timeoutMs: 60000,
    });
  },

  adminStats(): Promise<AdminStats> {
    return request<AdminStats>("/admin/stats");
  },

  authors(): Promise<AuthorOverview[]> {
    return request<AuthorOverview[]>("/admin/authors");
  },

  aiHealth(): Promise<AiHealth> {
    return request<AiHealth>("/admin/ai/health");
  },
};

export function streamUrl(token: string): string {
  const path = `${API_BASE}/stream?token=${encodeURIComponent(token)}`;
  if (path.startsWith("http")) return path;
  return new URL(path, window.location.origin).toString();
}
