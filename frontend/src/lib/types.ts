export type Role = "AUTHOR" | "ADMIN";

export type TicketStatus = "Open" | "In Progress" | "Resolved" | "Closed";
export type TicketPriority = "Critical" | "High" | "Medium" | "Low";
export type TicketCategory =
  | "Royalty & Payments"
  | "ISBN & Metadata Issues"
  | "Printing & Quality"
  | "Distribution & Availability"
  | "Book Status & Production Updates"
  | "General Inquiry";
export type ClassificationSource = "ai" | "rules" | "admin_override" | "manual_fallback";

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  city?: string | null;
  joined_date?: string | null;
  role: Role;
}

export interface UserBrief {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface Book {
  id: string;
  author_id: string;
  title: string;
  isbn: string;
  genre?: string | null;
  publication_date?: string | null;
  status: string;
  mrp?: number | null;
  author_royalty_per_copy?: number | null;
  total_copies_sold: number;
  total_royalty_earned: number;
  royalty_paid: number;
  royalty_pending: number;
  last_royalty_payout_date?: string | null;
  print_partner?: string | null;
  available_on: string[];
  is_in_production: boolean;
  production_stage?: string | null;
  production_stage_number?: number | null;
  production_stage_count: number;
  next_production_stage?: string | null;
  has_published: boolean;
  is_royalty_rollover: boolean;
}

export interface BookBrief {
  id: string;
  title: string;
  isbn: string;
  status: string;
  publication_date?: string | null;
  is_in_production: boolean;
}

export interface TicketSummary {
  id: string;
  ticket_number: string;
  author_id: string;
  author: UserBrief;
  book_id?: string | null;
  book?: BookBrief | null;
  subject: string;
  status: TicketStatus;
  category?: TicketCategory | null;
  priority?: TicketPriority | null;
  ai_classified: boolean;
  ai_model_used?: string | null;
  ai_confidence?: number | null;
  ai_suggested_category?: TicketCategory | null;
  ai_suggested_priority?: TicketPriority | null;
  assigned_admin?: UserBrief | null;
  message_count: number;
  last_message_at?: string | null;
  created_at: string;
  updated_at: string;
  classification_source: ClassificationSource;
}

export interface Message {
  id: string;
  ticket_id: string;
  sender: UserBrief;
  content: string;
  is_internal_note: boolean;
  created_at: string;
}

export interface TicketDetail extends TicketSummary {
  description: string;
  attachment_name?: string | null;
  author: User;
  book?: Book | null;
  messages: Message[];
  ai_draft_response?: string | null;
  ai_error?: string | null;
}

export interface TicketCreated extends TicketDetail {
  ai_degraded: boolean;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface AdminStats {
  total: number;
  open: number;
  in_progress: number;
  resolved: number;
  closed: number;
  critical: number;
  unassigned: number;
  ai_offline: number;
  created_last_7_days: number;
  pending_royalty_total: number;
}

export interface AuthorOverview {
  id: string;
  name: string;
  email: string;
  city?: string | null;
  joined_date?: string | null;
  book_count: number;
  published_count: number;
  pending_royalty: number;
  open_tickets: number;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface DraftResponse {
  ticket_id: string;
  ai_draft_response: string;
  ai_model_used?: string | null;
  ai_classified: boolean;
  ai_confidence?: number | null;
  generated_at: string;
}

export interface AiMetrics {
  calls: number;
  failures: number;
  retries: number;
  prompt_tokens: number;
  completion_tokens: number;
  avg_latency_ms?: number | null;
  last_latency_ms?: number | null;
  last_model?: string | null;
}

export interface AiHealth {
  provider: string;
  model: string;
  configured: boolean;
  mode: "llm" | "rule_engine";
  fallback_enabled: boolean;
  two_pass: boolean;
  metrics: AiMetrics;
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  environment: string;
  time: string;
  ai: AiHealth;
  realtime: { sse_clients: number };
}

export interface TicketFilters {
  status?: TicketStatus | "";
  category?: TicketCategory | "";
  priority?: TicketPriority | "";
  date_from?: string;
  date_to?: string;
  q?: string;
  unassigned?: boolean;
  mine?: boolean;
  page?: number;
  page_size?: number;
}
