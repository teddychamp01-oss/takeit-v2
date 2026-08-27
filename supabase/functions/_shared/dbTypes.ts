// Take It v2 — minimal Database typing for the edge functions' supabase-js
// clients. This is NOT the full schema: it declares only the tables/columns
// these functions actually touch, hand-written against the source of truth in
// supabase/migrations/20260827000300_tables.sql (+ 000200_enums.sql).
// If a migration renames one of these columns, `deno check` breaks here —
// which is exactly the point. Regenerating full types
// (supabase gen types typescript) can replace this file later.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type JobStatus =
  | 'open'
  | 'matched'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'disputed';

export type PaymentStatus =
  | 'logged'
  | 'initiated'
  | 'held'
  | 'released'
  | 'refunded'
  | 'failed';

export type PaymentProvider = 'chapa' | 'offapp';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          locale: string;
          is_customer: boolean;
          telegram_id: string | null;
        };
        Insert: {
          id: string;
          display_name?: string;
          locale?: string;
          is_customer?: boolean;
          telegram_id?: string | null;
        };
        Update: {
          display_name?: string;
          locale?: string;
          is_customer?: boolean;
          telegram_id?: string | null;
        };
        Relationships: [];
      };
      service_categories: {
        Row: {
          slug: string;
          name_am: string;
          name_en: string;
          icon: string | null;
          sort: number;
          active: boolean;
        };
        Insert: {
          slug: string;
          name_am: string;
          name_en: string;
          icon?: string | null;
          sort?: number;
          active?: boolean;
        };
        Update: {
          name_am?: string;
          name_en?: string;
          icon?: string | null;
          sort?: number;
          active?: boolean;
        };
        Relationships: [];
      };
      jobs: {
        Row: {
          id: string;
          customer_id: string;
          category_slug: string;
          title: string;
          description: string | null;
          service_neighborhood: string | null;
          service_landmark: string | null;
          budget_cents: number | null;
          currency: string;
          date_needed: string | null;
          status: JobStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          category_slug: string;
          title: string;
          description?: string | null;
          service_neighborhood?: string | null;
          service_landmark?: string | null;
          budget_cents?: number | null;
          currency?: string;
          date_needed?: string | null;
          status?: JobStatus;
        };
        Update: {
          title?: string;
          description?: string | null;
          status?: JobStatus;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          booking_id: string;
          provider: PaymentProvider;
          provider_ref: string | null;
          amount_cents: number;
          commission_cents: number;
          currency: string;
          status: PaymentStatus;
        };
        Insert: {
          id?: string;
          booking_id: string;
          provider: PaymentProvider;
          provider_ref?: string | null;
          amount_cents: number;
          commission_cents?: number;
          currency?: string;
          status?: PaymentStatus;
        };
        Update: {
          provider_ref?: string | null;
          status?: PaymentStatus;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          entity: string;
          entity_id: string | null;
          diff: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          action: string;
          entity: string;
          entity_id?: string | null;
          diff?: Json;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      job_status: JobStatus;
      payment_status: PaymentStatus;
      payment_provider: PaymentProvider;
    };
    CompositeTypes: Record<string, never>;
  };
}
