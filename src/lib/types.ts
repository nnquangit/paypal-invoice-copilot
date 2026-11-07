export type InvoiceStatus =
  | "DRAFT"
  | "SENT"
  | "SCHEDULED"
  | "PAID"
  | "MARKED_AS_PAID"
  | "CANCELLED"
  | "REFUNDED"
  | "PARTIALLY_PAID"
  | "UNPAID"
  | "PAYMENT_PENDING";

export interface InvoiceItem {
  name: string;
  description?: string;
  quantity: string;
  unit_amount: { currency_code: string; value: string };
}

export interface Invoice {
  id: string;
  invoice_number: string;
  status: InvoiceStatus;
  currency_code: string;
  recipient_email: string;
  recipient_name?: string;
  recipient_business?: string;
  note?: string;
  due_date?: string;
  invoice_date: string;
  items: InvoiceItem[];
  amount: { currency_code: string; value: string };
  href?: string;
  qr_code_data_url?: string;
  reminder_count: number;
  created_at: string;
  updated_at: string;
  /** Provenance: real PayPal sandbox record vs local in-memory mock row. */
  source?: InvoiceSource;
}

export type InvoiceSource = "paypal-sandbox" | "local-mock";

export interface PendingAction {
  id: string;
  tool: "send_invoice" | "send_invoice_reminder" | "cancel_sent_invoice";
  invoice_id: string;
  summary: string;
  args: Record<string, unknown>;
  created_at: string;
}

export interface AppMode {
  demoMode: boolean;
  paypalConfigured: boolean;
  llmConfigured: boolean;
  /** "sandbox" = PayPal sandbox API in use; "mock" = local in-memory desk, no PayPal calls. */
  paypalEnvironment: "sandbox" | "mock";
  llmProvider: string;
  /** Why present PayPal credentials are not used (sandbox-only / hosted restriction). */
  paypalConfigError?: string;
  /** Why a present LLM key is not used (bad base URL / hosted restriction). */
  llmConfigError?: string;
  /** False when live credentials are active but this request is not from loopback. */
  liveAccess?: boolean;
  /** False when OAuth works but Invoicing feature/scope is missing on the REST app. */
  paypalInvoicingOk?: boolean;
  paypalInvoicingMessage?: string;
  llmModel?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  pendingAction?: PendingAction;
  invoices?: Invoice[];
}
