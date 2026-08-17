export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      categories: {
        Row: {
          id: string;
          name_en: string;
          name_nl: string;
          sort_order: number | null;
          vendor_id: string;
        };
        Insert: {
          id?: string;
          name_en: string;
          name_nl: string;
          sort_order?: number | null;
          vendor_id: string;
        };
        Update: {
          id?: string;
          name_en?: string;
          name_nl?: string;
          sort_order?: number | null;
          vendor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      item_slot_discounts: {
        Row: {
          discount_cents: number | null;
          discount_pct: number | null;
          id: string;
          menu_item_id: string;
          slot_id: string;
        };
        Insert: {
          discount_cents?: number | null;
          discount_pct?: number | null;
          id?: string;
          menu_item_id: string;
          slot_id: string;
        };
        Update: {
          discount_cents?: number | null;
          discount_pct?: number | null;
          id?: string;
          menu_item_id?: string;
          slot_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "item_slot_discounts_menu_item_id_fkey";
            columns: ["menu_item_id"];
            isOneToOne: false;
            referencedRelation: "menu_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "item_slot_discounts_slot_id_fkey";
            columns: ["slot_id"];
            isOneToOne: false;
            referencedRelation: "slots";
            referencedColumns: ["id"];
          },
        ];
      };
      menu_items: {
        Row: {
          category_id: string | null;
          daily_stock: number | null;
          description_en: string | null;
          description_nl: string | null;
          id: string;
          image_url: string | null;
          is_available: boolean | null;
          name_en: string;
          name_nl: string;
          price_cents: number;
          sort_order: number | null;
          stock_date: string | null;
          stock_remaining: number | null;
          vendor_id: string;
        };
        Insert: {
          category_id?: string | null;
          daily_stock?: number | null;
          description_en?: string | null;
          description_nl?: string | null;
          id?: string;
          image_url?: string | null;
          is_available?: boolean | null;
          name_en: string;
          name_nl: string;
          price_cents: number;
          sort_order?: number | null;
          stock_date?: string | null;
          stock_remaining?: number | null;
          vendor_id: string;
        };
        Update: {
          category_id?: string | null;
          daily_stock?: number | null;
          description_en?: string | null;
          description_nl?: string | null;
          id?: string;
          image_url?: string | null;
          is_available?: boolean | null;
          name_en?: string;
          name_nl?: string;
          price_cents?: number;
          sort_order?: number | null;
          stock_date?: string | null;
          stock_remaining?: number | null;
          vendor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "menu_items_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: {
          discount_cents: number | null;
          id: string;
          menu_item_id: string | null;
          name: string;
          order_id: string;
          quantity: number;
          unit_price_cents: number;
        };
        Insert: {
          discount_cents?: number | null;
          id?: string;
          menu_item_id?: string | null;
          name: string;
          order_id: string;
          quantity?: number;
          unit_price_cents: number;
        };
        Update: {
          discount_cents?: number | null;
          id?: string;
          menu_item_id?: string | null;
          name?: string;
          order_id?: string;
          quantity?: number;
          unit_price_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey";
            columns: ["menu_item_id"];
            isOneToOne: false;
            referencedRelation: "menu_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          application_fee_cents: number;
          collected_at: string | null;
          commission_cents: number;
          created_at: string | null;
          customer_email: string | null;
          customer_name: string | null;
          customer_phone: string | null;
          customer_user_id: string;
          discount_cents: number;
          expires_at: string | null;
          id: string;
          idempotency_key: string | null;
          is_priority: boolean;
          no_show_at: string | null;
          order_code: string;
          paid_at: string | null;
          platform_fee_cents: number;
          priority_upcharge_cents: number;
          promo_code_id: string | null;
          promo_discount_cents: number;
          qr_token: string | null;
          reminder_sent_at: string | null;
          service_fee_cents: number;
          slot_id: string;
          status: string;
          stripe_checkout_session_id: string | null;
          stripe_payment_intent_id: string | null;
          subtotal_cents: number;
          total_cents: number;
          vendor_id: string;
        };
        Insert: {
          application_fee_cents?: number;
          collected_at?: string | null;
          commission_cents?: number;
          created_at?: string | null;
          customer_email?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          customer_user_id: string;
          discount_cents?: number;
          expires_at?: string | null;
          id?: string;
          idempotency_key?: string | null;
          is_priority?: boolean;
          no_show_at?: string | null;
          order_code: string;
          paid_at?: string | null;
          platform_fee_cents?: number;
          priority_upcharge_cents?: number;
          promo_code_id?: string | null;
          promo_discount_cents?: number;
          qr_token?: string | null;
          reminder_sent_at?: string | null;
          service_fee_cents?: number;
          slot_id: string;
          status?: string;
          stripe_checkout_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          subtotal_cents?: number;
          total_cents?: number;
          vendor_id: string;
        };
        Update: {
          application_fee_cents?: number;
          collected_at?: string | null;
          commission_cents?: number;
          created_at?: string | null;
          customer_email?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          customer_user_id?: string;
          discount_cents?: number;
          expires_at?: string | null;
          id?: string;
          idempotency_key?: string | null;
          is_priority?: boolean;
          no_show_at?: string | null;
          order_code?: string;
          paid_at?: string | null;
          platform_fee_cents?: number;
          priority_upcharge_cents?: number;
          promo_code_id?: string | null;
          promo_discount_cents?: number;
          qr_token?: string | null;
          reminder_sent_at?: string | null;
          service_fee_cents?: number;
          slot_id?: string;
          status?: string;
          stripe_checkout_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          subtotal_cents?: number;
          total_cents?: number;
          vendor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_promo_code_id_fkey";
            columns: ["promo_code_id"];
            isOneToOne: false;
            referencedRelation: "promo_codes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_slot_id_fkey";
            columns: ["slot_id"];
            isOneToOne: false;
            referencedRelation: "slots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      pricing_rules: {
        Row: {
          active: boolean;
          created_at: string;
          discount_pct: number;
          id: string;
          max_fill_pct: number;
          priority: number;
          trigger_minutes: number;
          updated_at: string;
          vendor_id: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          discount_pct: number;
          id?: string;
          max_fill_pct: number;
          priority?: number;
          trigger_minutes: number;
          updated_at?: string;
          vendor_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          discount_pct?: number;
          id?: string;
          max_fill_pct?: number;
          priority?: number;
          trigger_minutes?: number;
          updated_at?: string;
          vendor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pricing_rules_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      promo_codes: {
        Row: {
          code: string;
          created_at: string;
          expires_at: string | null;
          id: string;
          is_active: boolean;
          kind: string;
          max_uses: number | null;
          min_subtotal_cents: number | null;
          owner_user_id: string | null;
          updated_at: string;
          uses_count: number;
          value_cents: number | null;
          value_pct: number | null;
          vendor_id: string | null;
        };
        Insert: {
          code: string;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          is_active?: boolean;
          kind: string;
          max_uses?: number | null;
          min_subtotal_cents?: number | null;
          owner_user_id?: string | null;
          updated_at?: string;
          uses_count?: number;
          value_cents?: number | null;
          value_pct?: number | null;
          vendor_id?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          is_active?: boolean;
          kind?: string;
          max_uses?: number | null;
          min_subtotal_cents?: number | null;
          owner_user_id?: string | null;
          updated_at?: string;
          uses_count?: number;
          value_cents?: number | null;
          value_pct?: number | null;
          vendor_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "promo_codes_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      promo_redemptions: {
        Row: {
          amount_cents: number;
          created_at: string;
          customer_email: string | null;
          id: string;
          order_id: string | null;
          promo_code_id: string;
          user_id: string | null;
        };
        Insert: {
          amount_cents?: number;
          created_at?: string;
          customer_email?: string | null;
          id?: string;
          order_id?: string | null;
          promo_code_id: string;
          user_id?: string | null;
        };
        Update: {
          amount_cents?: number;
          created_at?: string;
          customer_email?: string | null;
          id?: string;
          order_id?: string | null;
          promo_code_id?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "promo_redemptions_promo_code_id_fkey";
            columns: ["promo_code_id"];
            isOneToOne: false;
            referencedRelation: "promo_codes";
            referencedColumns: ["id"];
          },
        ];
      };
      push_tokens: {
        Row: {
          platform: string;
          token: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          platform?: string;
          token: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          platform?: string;
          token?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      reviews: {
        Row: {
          comment: string | null;
          created_at: string;
          customer_user_id: string | null;
          id: string;
          is_hidden: boolean;
          order_id: string;
          rating: number;
          vendor_id: string;
        };
        Insert: {
          comment?: string | null;
          created_at?: string;
          customer_user_id?: string | null;
          id?: string;
          is_hidden?: boolean;
          order_id: string;
          rating: number;
          vendor_id: string;
        };
        Update: {
          comment?: string | null;
          created_at?: string;
          customer_user_id?: string | null;
          id?: string;
          is_hidden?: boolean;
          order_id?: string;
          rating?: number;
          vendor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: true;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      slots: {
        Row: {
          auto_discount_pct: number;
          capacity: number;
          date: string;
          discount_pct: number;
          effective_discount_pct: number | null;
          end_time: string;
          id: string;
          is_open: boolean;
          orders_count: number;
          orders_reserved: number;
          priority_capacity: number;
          priority_taken: number;
          priority_upcharge_cents: number;
          start_time: string;
          vendor_id: string;
        };
        Insert: {
          auto_discount_pct?: number;
          capacity?: number;
          date: string;
          discount_pct?: number;
          effective_discount_pct?: number | null;
          end_time: string;
          id?: string;
          is_open?: boolean;
          orders_count?: number;
          orders_reserved?: number;
          priority_capacity?: number;
          priority_taken?: number;
          priority_upcharge_cents?: number;
          start_time: string;
          vendor_id: string;
        };
        Update: {
          auto_discount_pct?: number;
          capacity?: number;
          date?: string;
          discount_pct?: number;
          effective_discount_pct?: number | null;
          end_time?: string;
          id?: string;
          is_open?: boolean;
          orders_count?: number;
          orders_reserved?: number;
          priority_capacity?: number;
          priority_taken?: number;
          priority_upcharge_cents?: number;
          start_time?: string;
          vendor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "slots_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      staff: {
        Row: {
          auth_user_id: string;
          created_at: string | null;
          email: string | null;
          id: string;
          vendor_id: string;
        };
        Insert: {
          auth_user_id: string;
          created_at?: string | null;
          email?: string | null;
          id?: string;
          vendor_id: string;
        };
        Update: {
          auth_user_id?: string;
          created_at?: string | null;
          email?: string | null;
          id?: string;
          vendor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      vendor_applications: {
        Row: {
          address: string | null;
          applicant_user_id: string | null;
          approved_vendor_id: string | null;
          brand_primary: string | null;
          business_name: string;
          contact_email: string;
          contact_name: string;
          created_at: string;
          cuisine: string;
          description: string | null;
          headline_en: string | null;
          headline_nl: string | null;
          hero_description: string | null;
          id: string;
          menu_draft: Json | null;
          phone: string | null;
          proposed_slug: string | null;
          review_notes: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          slots_draft: Json | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          applicant_user_id?: string | null;
          approved_vendor_id?: string | null;
          brand_primary?: string | null;
          business_name: string;
          contact_email: string;
          contact_name: string;
          created_at?: string;
          cuisine: string;
          description?: string | null;
          headline_en?: string | null;
          headline_nl?: string | null;
          hero_description?: string | null;
          id?: string;
          menu_draft?: Json | null;
          phone?: string | null;
          proposed_slug?: string | null;
          review_notes?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          slots_draft?: Json | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          applicant_user_id?: string | null;
          approved_vendor_id?: string | null;
          brand_primary?: string | null;
          business_name?: string;
          contact_email?: string;
          contact_name?: string;
          created_at?: string;
          cuisine?: string;
          description?: string | null;
          headline_en?: string | null;
          headline_nl?: string | null;
          hero_description?: string | null;
          id?: string;
          menu_draft?: Json | null;
          phone?: string | null;
          proposed_slug?: string | null;
          review_notes?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          slots_draft?: Json | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vendor_applications_approved_vendor_id_fkey";
            columns: ["approved_vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      vendors: {
        Row: {
          address: string | null;
          brand_primary: string | null;
          brand_secondary: string | null;
          city: string | null;
          commission_pct: number;
          created_at: string | null;
          cuisine: string;
          currency: string | null;
          description: string | null;
          dynamic_pricing_enabled: boolean;
          featured_headline_en: string | null;
          featured_headline_nl: string | null;
          grace_minutes: number;
          hero_url: string | null;
          id: string;
          is_active: boolean | null;
          is_featured: boolean | null;
          lat: number | null;
          lng: number | null;
          logo_url: string | null;
          name: string;
          rating: number | null;
          rating_count: number;
          service_fee_cents: number | null;
          slug: string;
          stripe_account_id: string | null;
          stripe_charges_enabled: boolean;
          stripe_details_submitted: boolean;
          stripe_payouts_enabled: boolean;
          timezone: string | null;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          brand_primary?: string | null;
          brand_secondary?: string | null;
          city?: string | null;
          commission_pct?: number;
          created_at?: string | null;
          cuisine: string;
          currency?: string | null;
          description?: string | null;
          dynamic_pricing_enabled?: boolean;
          featured_headline_en?: string | null;
          featured_headline_nl?: string | null;
          grace_minutes?: number;
          hero_url?: string | null;
          id?: string;
          is_active?: boolean | null;
          is_featured?: boolean | null;
          lat?: number | null;
          lng?: number | null;
          logo_url?: string | null;
          name: string;
          rating?: number | null;
          rating_count?: number;
          service_fee_cents?: number | null;
          slug: string;
          stripe_account_id?: string | null;
          stripe_charges_enabled?: boolean;
          stripe_details_submitted?: boolean;
          stripe_payouts_enabled?: boolean;
          timezone?: string | null;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          brand_primary?: string | null;
          brand_secondary?: string | null;
          city?: string | null;
          commission_pct?: number;
          created_at?: string | null;
          cuisine?: string;
          currency?: string | null;
          description?: string | null;
          dynamic_pricing_enabled?: boolean;
          featured_headline_en?: string | null;
          featured_headline_nl?: string | null;
          grace_minutes?: number;
          hero_url?: string | null;
          id?: string;
          is_active?: boolean | null;
          is_featured?: boolean | null;
          lat?: number | null;
          lng?: number | null;
          logo_url?: string | null;
          name?: string;
          rating?: number | null;
          rating_count?: number;
          service_fee_cents?: number | null;
          slug?: string;
          stripe_account_id?: string | null;
          stripe_charges_enabled?: boolean;
          stripe_details_submitted?: boolean;
          stripe_payouts_enabled?: boolean;
          timezone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      waitlist_entries: {
        Row: {
          claimed_order_id: string | null;
          created_at: string;
          customer_email: string;
          customer_name: string | null;
          customer_user_id: string | null;
          id: string;
          offer_expires_at: string | null;
          offered_at: string | null;
          party_size: number;
          slot_id: string;
          status: string;
          updated_at: string;
          vendor_id: string;
        };
        Insert: {
          claimed_order_id?: string | null;
          created_at?: string;
          customer_email: string;
          customer_name?: string | null;
          customer_user_id?: string | null;
          id?: string;
          offer_expires_at?: string | null;
          offered_at?: string | null;
          party_size?: number;
          slot_id: string;
          status?: string;
          updated_at?: string;
          vendor_id: string;
        };
        Update: {
          claimed_order_id?: string | null;
          created_at?: string;
          customer_email?: string;
          customer_name?: string | null;
          customer_user_id?: string | null;
          id?: string;
          offer_expires_at?: string | null;
          offered_at?: string | null;
          party_size?: number;
          slot_id?: string;
          status?: string;
          updated_at?: string;
          vendor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "waitlist_entries_claimed_order_id_fkey";
            columns: ["claimed_order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "waitlist_entries_slot_id_fkey";
            columns: ["slot_id"];
            isOneToOne: false;
            referencedRelation: "slots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "waitlist_entries_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_set_vendor_flags: {
        Args: { _is_active?: boolean; _is_featured?: boolean; _vendor_id: string };
        Returns: undefined;
      };
      approve_vendor_application: {
        Args: {
          _application_id: string;
          _brand_primary?: string;
          _commission_pct?: number;
          _service_fee_cents?: number;
          _slug?: string;
        };
        Returns: string;
      };
      claim_waitlist_offer: { Args: { _entry_id: string }; Returns: string };
      decrement_stock: {
        Args: { _item_id: string; _qty: number };
        Returns: number;
      };
      expire_stale_pending_orders: {
        Args: { _older_than?: string };
        Returns: number;
      };
      finalize_paid_order: {
        Args: {
          _application_fee_cents?: number;
          _order_id: string;
          _pi_id: string;
          _platform_fee_cents?: number;
        };
        Returns: boolean;
      };
      get_my_vendor: {
        Args: never;
        Returns: {
          address: string | null;
          brand_primary: string | null;
          brand_secondary: string | null;
          city: string | null;
          commission_pct: number;
          created_at: string | null;
          cuisine: string;
          currency: string | null;
          description: string | null;
          dynamic_pricing_enabled: boolean;
          featured_headline_en: string | null;
          featured_headline_nl: string | null;
          grace_minutes: number;
          hero_url: string | null;
          id: string;
          is_active: boolean | null;
          is_featured: boolean | null;
          lat: number | null;
          lng: number | null;
          logo_url: string | null;
          name: string;
          rating: number | null;
          rating_count: number;
          service_fee_cents: number | null;
          slug: string;
          stripe_account_id: string | null;
          stripe_charges_enabled: boolean;
          stripe_details_submitted: boolean;
          stripe_payouts_enabled: boolean;
          timezone: string | null;
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "vendors";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      get_or_create_my_referral_code: { Args: never; Returns: string };
      get_order_by_code: {
        Args: { _code: string };
        Returns: {
          application_fee_cents: number;
          collected_at: string | null;
          commission_cents: number;
          created_at: string | null;
          customer_email: string | null;
          customer_name: string | null;
          customer_phone: string | null;
          customer_user_id: string;
          discount_cents: number;
          expires_at: string | null;
          id: string;
          idempotency_key: string | null;
          is_priority: boolean;
          no_show_at: string | null;
          order_code: string;
          paid_at: string | null;
          platform_fee_cents: number;
          priority_upcharge_cents: number;
          promo_code_id: string | null;
          promo_discount_cents: number;
          qr_token: string | null;
          reminder_sent_at: string | null;
          service_fee_cents: number;
          slot_id: string;
          status: string;
          stripe_checkout_session_id: string | null;
          stripe_payment_intent_id: string | null;
          subtotal_cents: number;
          total_cents: number;
          vendor_id: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "orders";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      get_order_items_by_code: {
        Args: { _code: string };
        Returns: {
          discount_cents: number;
          id: string;
          menu_item_id: string;
          name: string;
          order_id: string;
          quantity: number;
          unit_price_cents: number;
        }[];
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_vendor_staff: { Args: { _vendor_id: string }; Returns: boolean };
      promote_waitlist: { Args: never; Returns: number };
      reject_vendor_application: {
        Args: { _application_id: string; _notes: string };
        Returns: undefined;
      };
      release_pending_order: {
        Args: { _new_status?: string; _order_id: string };
        Returns: boolean;
      };
      reserve_order: {
        Args: {
          _application_fee_cents: number;
          _commission_cents: number;
          _customer_email: string;
          _customer_name: string;
          _discount_cents: number;
          _expires_at: string;
          _idempotency_key: string;
          _is_priority: boolean;
          _items: Json;
          _order_code: string;
          _priority_upcharge_cents: number;
          _promo_code_id: string;
          _promo_discount_cents: number;
          _service_fee_cents: number;
          _slot_id: string;
          _subtotal_cents: number;
          _total_cents: number;
          _user_id: string;
          _vendor_id: string;
          _waitlist_entry_id: string;
        };
        Returns: {
          order_code: string;
          order_id: string;
        }[];
      };
      reset_daily_stock: { Args: never; Returns: undefined };
      validate_promo_code: {
        Args: {
          _code: string;
          _email?: string;
          _subtotal_cents: number;
          _user_id?: string;
          _vendor_id: string;
        };
        Returns: {
          code: string;
          discount_cents: number;
          kind: string;
          promo_code_id: string;
        }[];
      };
    };
    Enums: {
      app_role: "admin" | "vendor" | "customer";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "vendor", "customer"],
    },
  },
} as const;
