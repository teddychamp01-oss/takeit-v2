// GENERATED FILE — do not edit by hand.
// Source: live Supabase project snfkefcluzkdeztdtdnk (public schema).
// Regenerate with: supabase gen types typescript --project-id snfkefcluzkdeztdtdnk
// (or the Supabase MCP generate_typescript_types tool).

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      applications: {
        Row: {
          committed_window: string | null
          created_at: string
          id: string
          job_id: string
          message: string | null
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
          worker_id: string
        }
        Insert: {
          committed_window?: string | null
          created_at?: string
          id?: string
          job_id: string
          message?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          worker_id: string
        }
        Update: {
          committed_window?: string | null
          created_at?: string
          id?: string
          job_id?: string
          message?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          diff: Json
          entity: string
          entity_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          diff?: Json
          entity: string
          entity_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          diff?: Json
          entity?: string
          entity_id?: string | null
          id?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          agreed_price_cents: number
          completed_at: string | null
          created_at: string
          currency: string
          customer_id: string
          id: string
          job_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["booking_status"]
          updated_at: string
          worker_done_at: string | null
          worker_id: string
        }
        Insert: {
          agreed_price_cents: number
          completed_at?: string | null
          created_at?: string
          currency?: string
          customer_id: string
          id?: string
          job_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
          worker_done_at?: string | null
          worker_id: string
        }
        Update: {
          agreed_price_cents?: number
          completed_at?: string | null
          created_at?: string
          currency?: string
          customer_id?: string
          id?: string
          job_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
          worker_done_at?: string | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_accounts: {
        Row: {
          active: boolean
          business_name: string
          created_at: string
          id: string
          owner_id: string
          tin: string | null
          type: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          business_name: string
          created_at?: string
          id?: string
          owner_id: string
          tin?: string | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          business_name?: string
          created_at?: string
          id?: string
          owner_id?: string
          tin?: string | null
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_accounts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          booking_id: string
          created_at: string
          evidence: Json
          id: string
          opened_by: string
          reason: string
          resolution: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["dispute_status"]
          updated_at: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          evidence?: Json
          id?: string
          opened_by: string
          reason: string
          resolution?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          updated_at?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          evidence?: Json
          id?: string
          opened_by?: string
          reason?: string
          resolution?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      guarantee_claims: {
        Row: {
          amount_cents: number | null
          booking_id: string
          claim_type: string
          claimant_id: string
          created_at: string
          currency: string
          decided_by: string | null
          id: string
          status: Database["public"]["Enums"]["claim_status"]
          updated_at: string
        }
        Insert: {
          amount_cents?: number | null
          booking_id: string
          claim_type: string
          claimant_id: string
          created_at?: string
          currency?: string
          decided_by?: string | null
          id?: string
          status?: Database["public"]["Enums"]["claim_status"]
          updated_at?: string
        }
        Update: {
          amount_cents?: number | null
          booking_id?: string
          claim_type?: string
          claimant_id?: string
          created_at?: string
          currency?: string
          decided_by?: string | null
          id?: string
          status?: Database["public"]["Enums"]["claim_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guarantee_claims_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guarantee_claims_claimant_id_fkey"
            columns: ["claimant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guarantee_claims_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      guarantors: {
        Row: {
          created_at: string
          guarantor_contact_masked: string | null
          guarantor_name: string
          guarantor_type: Database["public"]["Enums"]["guarantor_type"]
          id: string
          statement: string | null
          status: Database["public"]["Enums"]["guarantor_status"]
          updated_at: string
          verified_by: string | null
          worker_id: string
        }
        Insert: {
          created_at?: string
          guarantor_contact_masked?: string | null
          guarantor_name: string
          guarantor_type: Database["public"]["Enums"]["guarantor_type"]
          id?: string
          statement?: string | null
          status?: Database["public"]["Enums"]["guarantor_status"]
          updated_at?: string
          verified_by?: string | null
          worker_id: string
        }
        Update: {
          created_at?: string
          guarantor_contact_masked?: string | null
          guarantor_name?: string
          guarantor_type?: Database["public"]["Enums"]["guarantor_type"]
          id?: string
          statement?: string | null
          status?: Database["public"]["Enums"]["guarantor_status"]
          updated_at?: string
          verified_by?: string | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guarantors_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guarantors_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      jobs: {
        Row: {
          budget_cents: number | null
          category_slug: string
          created_at: string
          currency: string
          customer_id: string
          date_needed: string | null
          description: string | null
          id: string
          is_diaspora: boolean
          is_seed: boolean
          local_contact_name: string | null
          local_contact_phone_masked: string | null
          service_address_text: string | null
          service_geo: unknown
          service_landmark: string | null
          service_neighborhood: string | null
          status: Database["public"]["Enums"]["job_status"]
          time_window: string | null
          title: string
          updated_at: string
          workers_needed: number
        }
        Insert: {
          budget_cents?: number | null
          category_slug: string
          created_at?: string
          currency?: string
          customer_id: string
          date_needed?: string | null
          description?: string | null
          id?: string
          is_diaspora?: boolean
          is_seed?: boolean
          local_contact_name?: string | null
          local_contact_phone_masked?: string | null
          service_address_text?: string | null
          service_geo?: unknown
          service_landmark?: string | null
          service_neighborhood?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          time_window?: string | null
          title: string
          updated_at?: string
          workers_needed?: number
        }
        Update: {
          budget_cents?: number | null
          category_slug?: string
          created_at?: string
          currency?: string
          customer_id?: string
          date_needed?: string | null
          description?: string | null
          id?: string
          is_diaspora?: boolean
          is_seed?: boolean
          local_contact_name?: string | null
          local_contact_phone_masked?: string | null
          service_address_text?: string | null
          service_geo?: unknown
          service_landmark?: string | null
          service_neighborhood?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          time_window?: string | null
          title?: string
          updated_at?: string
          workers_needed?: number
        }
        Relationships: [
          {
            foreignKeyName: "jobs_category_slug_fkey"
            columns: ["category_slug"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          booking_id: string
          created_at: string
          id: string
          read_at: string | null
          sender_id: string
        }
        Insert: {
          body: string
          booking_id: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id: string
        }
        Update: {
          body?: string
          booking_id?: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          payload: Json
          read_at: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          booking_id: string
          chapa_subaccount_id: string | null
          commission_cents: number
          created_at: string
          currency: string
          customer_confirmed: boolean
          id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_ref: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          worker_confirmed: boolean
        }
        Insert: {
          amount_cents: number
          booking_id: string
          chapa_subaccount_id?: string | null
          commission_cents?: number
          created_at?: string
          currency?: string
          customer_confirmed?: boolean
          id?: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_ref?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          worker_confirmed?: boolean
        }
        Update: {
          amount_cents?: number
          booking_id?: string
          chapa_subaccount_id?: string | null
          commission_cents?: number
          created_at?: string
          currency?: string
          customer_confirmed?: boolean
          id?: string
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_ref?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          worker_confirmed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          id: string
          payment_id: string | null
          provider_ref: string | null
          status: Database["public"]["Enums"]["payout_status"]
          updated_at: string
          worker_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          id?: string
          payment_id?: string | null
          provider_ref?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
          updated_at?: string
          worker_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          id?: string
          payment_id?: string | null
          provider_ref?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          default_neighborhood: string | null
          display_name: string
          id: string
          is_customer: boolean
          is_seed: boolean
          is_worker: boolean
          locale: string
          phone_masked: string | null
          telegram_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          default_neighborhood?: string | null
          display_name?: string
          id: string
          is_customer?: boolean
          is_seed?: boolean
          is_worker?: boolean
          locale?: string
          phone_masked?: string | null
          telegram_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          default_neighborhood?: string | null
          display_name?: string
          id?: string
          is_customer?: boolean
          is_seed?: boolean
          is_worker?: boolean
          locale?: string
          phone_masked?: string | null
          telegram_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          booking_id: string | null
          created_at: string
          description: string | null
          id: string
          notes: string | null
          reason: string
          reported_id: string
          reporter_id: string
          resolved_by: string | null
          status: Database["public"]["Enums"]["report_status"]
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          notes?: string | null
          reason: string
          reported_id: string
          reporter_id: string
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          notes?: string | null
          reason?: string
          reported_id?: string
          reporter_id?: string
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reported_id_fkey"
            columns: ["reported_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          booking_id: string
          comment: string | null
          created_at: string
          direction: Database["public"]["Enums"]["review_direction"]
          id: string
          is_published: boolean
          published_at: string | null
          rating: number
          reviewee_id: string
          reviewer_id: string
        }
        Insert: {
          booking_id: string
          comment?: string | null
          created_at?: string
          direction: Database["public"]["Enums"]["review_direction"]
          id?: string
          is_published?: boolean
          published_at?: string | null
          rating: number
          reviewee_id: string
          reviewer_id: string
        }
        Update: {
          booking_id?: string
          comment?: string | null
          created_at?: string
          direction?: Database["public"]["Enums"]["review_direction"]
          id?: string
          is_published?: boolean
          published_at?: string | null
          rating?: number
          reviewee_id?: string
          reviewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewee_id_fkey"
            columns: ["reviewee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_workers: {
        Row: {
          created_at: string
          customer_id: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          worker_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_workers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_workers_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      service_categories: {
        Row: {
          active: boolean
          created_at: string
          icon: string | null
          min_verification_level: Database["public"]["Enums"]["verification_level"]
          name_am: string
          name_en: string
          slug: string
          sort: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          icon?: string | null
          min_verification_level?: Database["public"]["Enums"]["verification_level"]
          name_am: string
          name_en: string
          slug: string
          sort?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          icon?: string | null
          min_verification_level?: Database["public"]["Enums"]["verification_level"]
          name_am?: string
          name_en?: string
          slug?: string
          sort?: number
          updated_at?: string
        }
        Relationships: []
      }
      service_packages: {
        Row: {
          active: boolean
          base_price_cents: number
          category_slug: string
          checklist: Json
          created_at: string
          currency: string
          description: string | null
          duration_min: number | null
          id: string
          name_am: string
          name_en: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_price_cents: number
          category_slug: string
          checklist?: Json
          created_at?: string
          currency?: string
          description?: string | null
          duration_min?: number | null
          id?: string
          name_am: string
          name_en: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_price_cents?: number
          category_slug?: string
          checklist?: Json
          created_at?: string
          currency?: string
          description?: string | null
          duration_min?: number | null
          id?: string
          name_am?: string
          name_en?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_packages_category_slug_fkey"
            columns: ["category_slug"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["slug"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      verifications: {
        Row: {
          attributes: Json | null
          created_at: string
          decided_at: string | null
          fayda_number_hash: string | null
          fayda_txn_id: string | null
          id: string
          id_back_path: string | null
          id_front_path: string | null
          method: Database["public"]["Enums"]["verification_method"]
          notes: string | null
          reviewer_id: string | null
          selfie_path: string | null
          status: Database["public"]["Enums"]["verification_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          attributes?: Json | null
          created_at?: string
          decided_at?: string | null
          fayda_number_hash?: string | null
          fayda_txn_id?: string | null
          id?: string
          id_back_path?: string | null
          id_front_path?: string | null
          method: Database["public"]["Enums"]["verification_method"]
          notes?: string | null
          reviewer_id?: string | null
          selfie_path?: string | null
          status?: Database["public"]["Enums"]["verification_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          attributes?: Json | null
          created_at?: string
          decided_at?: string | null
          fayda_number_hash?: string | null
          fayda_txn_id?: string | null
          id?: string
          id_back_path?: string | null
          id_front_path?: string | null
          method?: Database["public"]["Enums"]["verification_method"]
          notes?: string | null
          reviewer_id?: string | null
          selfie_path?: string | null
          status?: Database["public"]["Enums"]["verification_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verifications_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_profiles: {
        Row: {
          availability: Json
          availability_status: Database["public"]["Enums"]["availability_status"]
          badge_level: Database["public"]["Enums"]["badge_level"]
          bio: string | null
          categories: string[]
          created_at: string
          geo: unknown
          jobs_completed: number
          neighborhood: string | null
          price_max_cents: number | null
          price_min_cents: number | null
          price_type: string | null
          rating_avg: number
          review_count: number
          skills: string[]
          travel_radius_km: number
          updated_at: string
          user_id: string
          verification_level: Database["public"]["Enums"]["verification_level"]
        }
        Insert: {
          availability?: Json
          availability_status?: Database["public"]["Enums"]["availability_status"]
          badge_level?: Database["public"]["Enums"]["badge_level"]
          bio?: string | null
          categories?: string[]
          created_at?: string
          geo?: unknown
          jobs_completed?: number
          neighborhood?: string | null
          price_max_cents?: number | null
          price_min_cents?: number | null
          price_type?: string | null
          rating_avg?: number
          review_count?: number
          skills?: string[]
          travel_radius_km?: number
          updated_at?: string
          user_id: string
          verification_level?: Database["public"]["Enums"]["verification_level"]
        }
        Update: {
          availability?: Json
          availability_status?: Database["public"]["Enums"]["availability_status"]
          badge_level?: Database["public"]["Enums"]["badge_level"]
          bio?: string | null
          categories?: string[]
          created_at?: string
          geo?: unknown
          jobs_completed?: number
          neighborhood?: string | null
          price_max_cents?: number | null
          price_min_cents?: number | null
          price_type?: string | null
          rating_avg?: number
          review_count?: number
          skills?: string[]
          travel_radius_km?: number
          updated_at?: string
          user_id?: string
          verification_level?: Database["public"]["Enums"]["verification_level"]
        }
        Relationships: [
          {
            foreignKeyName: "worker_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      audit_write: {
        Args: {
          p_action: string
          p_actor: string
          p_diff: Json
          p_entity: string
          p_entity_id: string
        }
        Returns: undefined
      }
      auto_release_bookings: { Args: never; Returns: number }
      enqueue_notification: {
        Args: { p_payload: Json; p_type: string; p_user: string }
        Returns: undefined
      }
      has_role: {
        Args: { r: Database["public"]["Enums"]["app_role"]; uid: string }
        Returns: boolean
      }
      mask_phone: { Args: { p: string }; Returns: string }
      mask_phone_numbers: { Args: { p: string }; Returns: string }
      nearby_workers: {
        Args: {
          category?: string
          lat: number
          lng: number
          radius_km?: number
        }
        Returns: {
          availability_status: Database["public"]["Enums"]["availability_status"]
          avatar_url: string
          badge_level: Database["public"]["Enums"]["badge_level"]
          categories: string[]
          display_name: string
          distance_m: number
          jobs_completed: number
          neighborhood: string
          price_max_cents: number
          price_min_cents: number
          price_type: string
          rating_avg: number
          review_count: number
          truncated: boolean
          verification_level: Database["public"]["Enums"]["verification_level"]
          worker_id: string
        }[]
      }
      publish_due_reviews: { Args: never; Returns: number }
      purge_expired_verification_metadata: {
        Args: { p_retention_days?: number }
        Returns: number
      }
      rpc_accept_application: {
        Args: { p_agreed_price_cents?: number; p_application_id: string }
        Returns: Json
      }
      rpc_admin_search_users: {
        Args: { p_id?: string; p_limit?: number; p_pattern?: string }
        Returns: Json
      }
      rpc_apply_to_job: {
        Args: {
          p_committed_window?: string
          p_job_id: string
          p_message?: string
        }
        Returns: Json
      }
      rpc_booking_cancel: {
        Args: { p_booking_id: string; p_reason?: string }
        Returns: Json
      }
      rpc_booking_customer_confirm: {
        Args: { p_booking_id: string }
        Returns: Json
      }
      rpc_booking_dispute: {
        Args: { p_booking_id: string; p_evidence?: Json; p_reason: string }
        Returns: Json
      }
      rpc_booking_start: { Args: { p_booking_id: string }; Returns: Json }
      rpc_booking_worker_done: { Args: { p_booking_id: string }; Returns: Json }
      rpc_log_offapp_payment: {
        Args: { p_amount_cents?: number; p_booking_id: string }
        Returns: Json
      }
      rpc_post_job: {
        Args: {
          p_budget_cents?: number
          p_category_slug: string
          p_date_needed?: string
          p_description?: string
          p_is_diaspora?: boolean
          p_lat?: number
          p_lng?: number
          p_local_contact_name?: string
          p_local_contact_phone?: string
          p_service_address_text?: string
          p_service_landmark?: string
          p_service_neighborhood?: string
          p_time_window?: string
          p_title: string
          p_workers_needed?: number
        }
        Returns: Json
      }
      rpc_send_message: {
        Args: { p_body: string; p_booking_id: string }
        Returns: Json
      }
      rpc_submit_review: {
        Args: { p_booking_id: string; p_comment?: string; p_rating: number }
        Returns: Json
      }
      text_contains_phone: { Args: { p: string }; Returns: boolean }
      verification_level_rank: {
        Args: { l: Database["public"]["Enums"]["verification_level"] }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "ops" | "support"
      application_status: "pending" | "accepted" | "rejected" | "withdrawn"
      availability_status: "available_now" | "available_today" | "busy" | "off"
      badge_level: "new" | "rising" | "trusted" | "pro" | "top"
      booking_status:
        | "confirmed"
        | "started"
        | "worker_done"
        | "customer_confirmed"
        | "disputed"
        | "cancelled"
      claim_status:
        | "submitted"
        | "reviewing"
        | "approved"
        | "denied"
        | "paid_via_provider"
      dispute_status: "open" | "reviewing" | "resolved" | "dismissed"
      guarantor_status: "pending" | "verified" | "rejected"
      guarantor_type: "idir" | "equb" | "employer" | "verified_worker"
      job_status:
        | "open"
        | "matched"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "disputed"
      payment_provider: "chapa" | "offapp"
      payment_status:
        | "logged"
        | "initiated"
        | "held"
        | "released"
        | "refunded"
        | "failed"
      payout_status: "pending" | "processing" | "paid" | "failed"
      report_status: "open" | "reviewing" | "resolved" | "dismissed"
      review_direction: "c_to_w" | "w_to_c"
      verification_level:
        | "none"
        | "basic"
        | "id_verified"
        | "fayda_verified"
        | "pro_certified"
      verification_method: "manual_id" | "fayda_ekyc"
      verification_status: "pending" | "approved" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database["public"]

export type Tables<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Update"]
export type Enums<T extends keyof DefaultSchema["Enums"]> =
  DefaultSchema["Enums"][T]

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "ops", "support"],
      application_status: ["pending", "accepted", "rejected", "withdrawn"],
      availability_status: ["available_now", "available_today", "busy", "off"],
      badge_level: ["new", "rising", "trusted", "pro", "top"],
      booking_status: [
        "confirmed",
        "started",
        "worker_done",
        "customer_confirmed",
        "disputed",
        "cancelled",
      ],
      claim_status: [
        "submitted",
        "reviewing",
        "approved",
        "denied",
        "paid_via_provider",
      ],
      dispute_status: ["open", "reviewing", "resolved", "dismissed"],
      guarantor_status: ["pending", "verified", "rejected"],
      guarantor_type: ["idir", "equb", "employer", "verified_worker"],
      job_status: [
        "open",
        "matched",
        "in_progress",
        "completed",
        "cancelled",
        "disputed",
      ],
      payment_provider: ["chapa", "offapp"],
      payment_status: [
        "logged",
        "initiated",
        "held",
        "released",
        "refunded",
        "failed",
      ],
      payout_status: ["pending", "processing", "paid", "failed"],
      report_status: ["open", "reviewing", "resolved", "dismissed"],
      review_direction: ["c_to_w", "w_to_c"],
      verification_level: [
        "none",
        "basic",
        "id_verified",
        "fayda_verified",
        "pro_certified",
      ],
      verification_method: ["manual_id", "fayda_ekyc"],
      verification_status: ["pending", "approved", "rejected"],
    },
  },
} as const
