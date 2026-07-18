export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          id: string
          name_en: string
          name_nl: string
          sort_order: number | null
          vendor_id: string
        }
        Insert: {
          id?: string
          name_en: string
          name_nl: string
          sort_order?: number | null
          vendor_id: string
        }
        Update: {
          id?: string
          name_en?: string
          name_nl?: string
          sort_order?: number | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      item_slot_discounts: {
        Row: {
          discount_cents: number | null
          discount_pct: number | null
          id: string
          menu_item_id: string
          slot_id: string
        }
        Insert: {
          discount_cents?: number | null
          discount_pct?: number | null
          id?: string
          menu_item_id: string
          slot_id: string
        }
        Update: {
          discount_cents?: number | null
          discount_pct?: number | null
          id?: string
          menu_item_id?: string
          slot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_slot_discounts_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_slot_discounts_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "slots"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          category_id: string | null
          daily_stock: number | null
          description_en: string | null
          description_nl: string | null
          id: string
          image_url: string | null
          is_available: boolean | null
          name_en: string
          name_nl: string
          price_cents: number
          sort_order: number | null
          stock_date: string | null
          stock_remaining: number | null
          vendor_id: string
        }
        Insert: {
          category_id?: string | null
          daily_stock?: number | null
          description_en?: string | null
          description_nl?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean | null
          name_en: string
          name_nl: string
          price_cents: number
          sort_order?: number | null
          stock_date?: string | null
          stock_remaining?: number | null
          vendor_id: string
        }
        Update: {
          category_id?: string | null
          daily_stock?: number | null
          description_en?: string | null
          description_nl?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean | null
          name_en?: string
          name_nl?: string
          price_cents?: number
          sort_order?: number | null
          stock_date?: string | null
          stock_remaining?: number | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          discount_cents: number | null
          id: string
          menu_item_id: string | null
          name: string
          order_id: string
          quantity: number
          unit_price_cents: number
        }
        Insert: {
          discount_cents?: number | null
          id?: string
          menu_item_id?: string | null
          name: string
          order_id: string
          quantity?: number
          unit_price_cents: number
        }
        Update: {
          discount_cents?: number | null
          id?: string
          menu_item_id?: string | null
          name?: string
          order_id?: string
          quantity?: number
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          application_fee_cents: number
          collected_at: string | null
          commission_cents: number
          created_at: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          customer_user_id: string | null
          discount_cents: number
          id: string
          no_show_at: string | null
          order_code: string
          paid_at: string | null
          platform_fee_cents: number
          qr_token: string | null
          reminder_sent_at: string | null
          service_fee_cents: number
          slot_id: string
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          subtotal_cents: number
          total_cents: number
          vendor_id: string
        }
        Insert: {
          application_fee_cents?: number
          collected_at?: string | null
          commission_cents?: number
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_user_id?: string | null
          discount_cents?: number
          id?: string
          no_show_at?: string | null
          order_code: string
          paid_at?: string | null
          platform_fee_cents?: number
          qr_token?: string | null
          reminder_sent_at?: string | null
          service_fee_cents?: number
          slot_id: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal_cents?: number
          total_cents?: number
          vendor_id: string
        }
        Update: {
          application_fee_cents?: number
          collected_at?: string | null
          commission_cents?: number
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_user_id?: string | null
          discount_cents?: number
          id?: string
          no_show_at?: string | null
          order_code?: string
          paid_at?: string | null
          platform_fee_cents?: number
          qr_token?: string | null
          reminder_sent_at?: string | null
          service_fee_cents?: number
          slot_id?: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal_cents?: number
          total_cents?: number
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_rules: {
        Row: {
          active: boolean
          created_at: string
          discount_pct: number
          id: string
          max_fill_pct: number
          priority: number
          trigger_minutes: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          discount_pct: number
          id?: string
          max_fill_pct: number
          priority?: number
          trigger_minutes: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          discount_pct?: number
          id?: string
          max_fill_pct?: number
          priority?: number
          trigger_minutes?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          customer_user_id: string | null
          id: string
          order_id: string
          rating: number
          vendor_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          customer_user_id?: string | null
          id?: string
          order_id: string
          rating: number
          vendor_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          customer_user_id?: string | null
          id?: string
          order_id?: string
          rating?: number
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      slots: {
        Row: {
          auto_discount_pct: number
          capacity: number
          date: string
          discount_pct: number
          end_time: string
          id: string
          is_open: boolean
          orders_count: number
          start_time: string
          vendor_id: string
        }
        Insert: {
          auto_discount_pct?: number
          capacity?: number
          date: string
          discount_pct?: number
          end_time: string
          id?: string
          is_open?: boolean
          orders_count?: number
          start_time: string
          vendor_id: string
        }
        Update: {
          auto_discount_pct?: number
          capacity?: number
          date?: string
          discount_pct?: number
          end_time?: string
          id?: string
          is_open?: boolean
          orders_count?: number
          start_time?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "slots_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          auth_user_id: string
          created_at: string | null
          email: string | null
          id: string
          vendor_id: string
        }
        Insert: {
          auth_user_id: string
          created_at?: string | null
          email?: string | null
          id?: string
          vendor_id: string
        }
        Update: {
          auth_user_id?: string
          created_at?: string | null
          email?: string | null
          id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vendor_applications: {
        Row: {
          address: string | null
          applicant_user_id: string | null
          approved_vendor_id: string | null
          business_name: string
          contact_email: string
          contact_name: string
          created_at: string
          cuisine: string
          description: string | null
          id: string
          phone: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          applicant_user_id?: string | null
          approved_vendor_id?: string | null
          business_name: string
          contact_email: string
          contact_name: string
          created_at?: string
          cuisine: string
          description?: string | null
          id?: string
          phone?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          applicant_user_id?: string | null
          approved_vendor_id?: string | null
          business_name?: string
          contact_email?: string
          contact_name?: string
          created_at?: string
          cuisine?: string
          description?: string | null
          id?: string
          phone?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_applications_approved_vendor_id_fkey"
            columns: ["approved_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          brand_primary: string | null
          brand_secondary: string | null
          commission_pct: number
          created_at: string | null
          cuisine: string
          currency: string | null
          description: string | null
          dynamic_pricing_enabled: boolean
          featured_headline_en: string | null
          featured_headline_nl: string | null
          grace_minutes: number
          hero_url: string | null
          id: string
          is_active: boolean | null
          is_featured: boolean | null
          lat: number | null
          lng: number | null
          logo_url: string | null
          name: string
          rating: number | null
          rating_count: number
          service_fee_cents: number | null
          slug: string
          stripe_account_id: string | null
          stripe_charges_enabled: boolean
          stripe_details_submitted: boolean
          stripe_payouts_enabled: boolean
          timezone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          brand_primary?: string | null
          brand_secondary?: string | null
          commission_pct?: number
          created_at?: string | null
          cuisine: string
          currency?: string | null
          description?: string | null
          dynamic_pricing_enabled?: boolean
          featured_headline_en?: string | null
          featured_headline_nl?: string | null
          grace_minutes?: number
          hero_url?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          lat?: number | null
          lng?: number | null
          logo_url?: string | null
          name: string
          rating?: number | null
          rating_count?: number
          service_fee_cents?: number | null
          slug: string
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          stripe_details_submitted?: boolean
          stripe_payouts_enabled?: boolean
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          brand_primary?: string | null
          brand_secondary?: string | null
          commission_pct?: number
          created_at?: string | null
          cuisine?: string
          currency?: string | null
          description?: string | null
          dynamic_pricing_enabled?: boolean
          featured_headline_en?: string | null
          featured_headline_nl?: string | null
          grace_minutes?: number
          hero_url?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          lat?: number | null
          lng?: number | null
          logo_url?: string | null
          name?: string
          rating?: number | null
          rating_count?: number
          service_fee_cents?: number | null
          slug?: string
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          stripe_details_submitted?: boolean
          stripe_payouts_enabled?: boolean
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_vendor_application: {
        Args: {
          _application_id: string
          _brand_primary?: string
          _commission_pct?: number
          _service_fee_cents?: number
          _slug: string
        }
        Returns: string
      }
      decrement_stock: {
        Args: { _item_id: string; _qty: number }
        Returns: number
      }
      get_order_by_code: {
        Args: { _code: string }
        Returns: {
          application_fee_cents: number
          collected_at: string | null
          commission_cents: number
          created_at: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          customer_user_id: string | null
          discount_cents: number
          id: string
          no_show_at: string | null
          order_code: string
          paid_at: string | null
          platform_fee_cents: number
          qr_token: string | null
          reminder_sent_at: string | null
          service_fee_cents: number
          slot_id: string
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          subtotal_cents: number
          total_cents: number
          vendor_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_order_items_by_code: {
        Args: { _code: string }
        Returns: {
          discount_cents: number
          id: string
          menu_item_id: string
          name: string
          order_id: string
          quantity: number
          unit_price_cents: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_vendor_staff: { Args: { _vendor_id: string }; Returns: boolean }
      reject_vendor_application: {
        Args: { _application_id: string; _notes: string }
        Returns: undefined
      }
      reset_daily_stock: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "vendor" | "customer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "vendor", "customer"],
    },
  },
} as const
