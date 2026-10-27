import type {
  ClassificationSource,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from "@/lib/types";

export const STATUSES: TicketStatus[] = ["Open", "In Progress", "Resolved", "Closed"];
export const PRIORITIES: TicketPriority[] = ["Critical", "High", "Medium", "Low"];
export const CATEGORIES: TicketCategory[] = [
  "Royalty & Payments",
  "ISBN & Metadata Issues",
  "Printing & Quality",
  "Distribution & Availability",
  "Book Status & Production Updates",
  "General Inquiry",
];

export const ROLLOVER_THRESHOLD_INR = 1000;

export const STATUS_STYLES: Record<TicketStatus, string> = {
  Open: "bg-gold-50 text-gold-700 ring-gold-200",
  "In Progress": "bg-sky-50 text-sky-700 ring-sky-200",
  Resolved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Closed: "bg-stone-100 text-stone-600 ring-stone-200",
};

export const STATUS_DOT: Record<TicketStatus, string> = {
  Open: "bg-gold-500",
  "In Progress": "bg-sky-500",
  Resolved: "bg-emerald-500",
  Closed: "bg-stone-400",
};

export const PRIORITY_STYLES: Record<TicketPriority, string> = {
  Critical: "bg-rose-50 text-rose-700 ring-rose-200",
  High: "bg-orange-50 text-orange-700 ring-orange-200",
  Medium: "bg-gold-50 text-gold-700 ring-gold-200",
  Low: "bg-stone-100 text-stone-600 ring-stone-200",
};

export const PRIORITY_ORDER: Record<TicketPriority, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

export const SOURCE_META: Record<
  ClassificationSource,
  { label: string; description: string; className: string }
> = {
  ai: {
    label: "AI triaged",
    description: "Categorised and prioritised by the configured AI model.",
    className: "bg-forest-50 text-forest-700 ring-forest-200",
  },
  rules: {
    label: "Rules engine",
    description: "Categorised by the deterministic offline rules engine.",
    className: "bg-gold-50 text-gold-700 ring-gold-200",
  },
  admin_override: {
    label: "Admin override",
    description: "A support admin adjusted the AI suggestion.",
    className: "bg-violet-50 text-violet-700 ring-violet-200",
  },
  manual_fallback: {
    label: "Manual review",
    description: "AI classification was unavailable; a human will triage this request.",
    className: "bg-stone-100 text-stone-600 ring-stone-200",
  },
};

export interface DemoAccount {
  label: string;
  name: string;
  email: string;
  password: string;
  role: "ADMIN" | "AUTHOR";
  context: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    label: "Admin queue",
    name: "Aarav Mehta",
    email: "admin@bookleaf.com",
    password: "password123",
    role: "ADMIN",
    context: "Full queue, AI drafts & triage",
  },
  {
    label: "Sneha Kulkarni",
    name: "Sneha Kulkarni",
    email: "sneha.kulkarni@email.com",
    password: "password123",
    role: "AUTHOR",
    context: "BK013 in Cover Design",
  },
  {
    label: "Kavita Deshmukh",
    name: "Kavita Deshmukh",
    email: "kavita.deshmukh@email.com",
    password: "password123",
    role: "AUTHOR",
    context: "Rollover royalty demo",
  },
  {
    label: "Rohit Kapoor",
    name: "Rohit Kapoor",
    email: "rohit.kapoor@email.com",
    password: "password123",
    role: "AUTHOR",
    context: "Critical royalty escalation",
  },
];
