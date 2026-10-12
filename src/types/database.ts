export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      cheque_payments: {
        Row: {
          bank_name: string
          cheque_number: string
          cleared_date: string | null
          created_at: string
          deposited_date: string
          id: string
          payment_id: string
          status: Database["public"]["Enums"]["cheque_status"]
          updated_at: string
        }
        Insert: {
          bank_name: string
          cheque_number: string
          cleared_date?: string | null
          created_at?: string
          deposited_date: string
          id?: string
          payment_id: string
          status?: Database["public"]["Enums"]["cheque_status"]
          updated_at?: string
        }
        Update: {
          bank_name?: string
          cheque_number?: string
          cleared_date?: string | null
          created_at?: string
          deposited_date?: string
          id?: string
          payment_id?: string
          status?: Database["public"]["Enums"]["cheque_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cheque_payments_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_evidence: {
        Row: {
          captured_at: string
          collection_id: string
          created_at: string
          document_id: string
          id: string
          latitude: number | null
          longitude: number | null
        }
        Insert: {
          captured_at: string
          collection_id: string
          created_at?: string
          document_id: string
          id?: string
          latitude?: number | null
          longitude?: number | null
        }
        Update: {
          captured_at?: string
          collection_id?: string
          created_at?: string
          document_id?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "collection_evidence_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_evidence_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_schedules: {
        Row: {
          created_at: string
          day_of_month: number | null
          day_of_week: number | null
          id: string
          is_active: boolean
          route_id: string | null
          subscription_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_month?: number | null
          day_of_week?: number | null
          id?: string
          is_active?: boolean
          route_id?: string | null
          subscription_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_month?: number | null
          day_of_week?: number | null
          id?: string
          is_active?: boolean
          route_id?: string | null
          subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_schedules_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_schedules_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_status_events: {
        Row: {
          actor_id: string | null
          collection_id: string
          created_at: string
          from_status: string | null
          id: string
          reason_code:
            | Database["public"]["Enums"]["collection_status_reason"]
            | null
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          collection_id: string
          created_at?: string
          from_status?: string | null
          id?: string
          reason_code?:
            | Database["public"]["Enums"]["collection_status_reason"]
            | null
          to_status: string
        }
        Update: {
          actor_id?: string | null
          collection_id?: string
          created_at?: string
          from_status?: string | null
          id?: string
          reason_code?:
            | Database["public"]["Enums"]["collection_status_reason"]
            | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_status_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_status_events_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          arrived_at: string | null
          collection_request_id: string | null
          completed_at: string | null
          created_at: string
          daily_assignment_id: string | null
          id: string
          scheduled_date: string
          service_address_id: string
          status: Database["public"]["Enums"]["collection_status"]
          subscription_id: string | null
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          arrived_at?: string | null
          collection_request_id?: string | null
          completed_at?: string | null
          created_at?: string
          daily_assignment_id?: string | null
          id?: string
          scheduled_date: string
          service_address_id: string
          status?: Database["public"]["Enums"]["collection_status"]
          subscription_id?: string | null
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          arrived_at?: string | null
          collection_request_id?: string | null
          completed_at?: string | null
          created_at?: string
          daily_assignment_id?: string | null
          id?: string
          scheduled_date?: string
          service_address_id?: string
          status?: Database["public"]["Enums"]["collection_status"]
          subscription_id?: string | null
          updated_at?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "collections_collection_request_id_fkey"
            columns: ["collection_request_id"]
            isOneToOne: false
            referencedRelation: "waste_collection_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_daily_assignment_id_fkey"
            columns: ["daily_assignment_id"]
            isOneToOne: false
            referencedRelation: "daily_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_service_address_id_fkey"
            columns: ["service_address_id"]
            isOneToOne: false
            referencedRelation: "service_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          billing_terms: Database["public"]["Enums"]["contract_billing_terms"]
          contract_number: string
          created_at: string
          customer_id: string
          end_date: string | null
          id: string
          signed_document_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["contract_status"]
          updated_at: string
        }
        Insert: {
          billing_terms: Database["public"]["Enums"]["contract_billing_terms"]
          contract_number: string
          created_at?: string
          customer_id: string
          end_date?: string | null
          id?: string
          signed_document_id?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["contract_status"]
          updated_at?: string
        }
        Update: {
          billing_terms?: Database["public"]["Enums"]["contract_billing_terms"]
          contract_number?: string
          created_at?: string
          customer_id?: string
          end_date?: string | null
          id?: string
          signed_document_id?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["contract_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_signed_document_id_fkey"
            columns: ["signed_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_contacts: {
        Row: {
          contact_phone_type: string | null
          created_at: string
          customer_id: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          receives_invoices: boolean
          title: string | null
          updated_at: string
        }
        Insert: {
          contact_phone_type?: string | null
          created_at?: string
          customer_id: string
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          receives_invoices?: boolean
          title?: string | null
          updated_at?: string
        }
        Update: {
          contact_phone_type?: string | null
          created_at?: string
          customer_id?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          receives_invoices?: boolean
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_contacts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_documents: {
        Row: {
          created_at: string
          customer_id: string
          document_id: string
          document_type: Database["public"]["Enums"]["customer_document_type"]
          id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          document_id: string
          document_type: Database["public"]["Enums"]["customer_document_type"]
          id?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          document_id?: string
          document_type?: Database["public"]["Enums"]["customer_document_type"]
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_documents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_profiles: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          is_primary_contact: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id: string
          is_primary_contact?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          is_primary_contact?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_profiles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_signup_requests: {
        Row: {
          address_description: string | null
          billing_cycle: Database["public"]["Enums"]["billing_cycle"] | null
          caretaker_email: string | null
          caretaker_name: string | null
          caretaker_phone: string | null
          county: string | null
          customer_id: string
          customer_type: Database["public"]["Enums"]["customer_type"]
          email: string | null
          house_number: string | null
          id: string
          name: string
          phone_primary: string | null
          phone_secondary: string | null
          region: string | null
          requested_services: string[]
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          service_days: number[]
          street_name: string | null
          submitted_at: string
          ward: string | null
        }
        Insert: {
          address_description?: string | null
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"] | null
          caretaker_email?: string | null
          caretaker_name?: string | null
          caretaker_phone?: string | null
          county?: string | null
          customer_id: string
          customer_type: Database["public"]["Enums"]["customer_type"]
          email?: string | null
          house_number?: string | null
          id?: string
          name: string
          phone_primary?: string | null
          phone_secondary?: string | null
          region?: string | null
          requested_services?: string[]
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_days?: number[]
          street_name?: string | null
          submitted_at?: string
          ward?: string | null
        }
        Update: {
          address_description?: string | null
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"] | null
          caretaker_email?: string | null
          caretaker_name?: string | null
          caretaker_phone?: string | null
          county?: string | null
          customer_id?: string
          customer_type?: Database["public"]["Enums"]["customer_type"]
          email?: string | null
          house_number?: string | null
          id?: string
          name?: string
          phone_primary?: string | null
          phone_secondary?: string | null
          region?: string | null
          requested_services?: string[]
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_days?: number[]
          street_name?: string | null
          submitted_at?: string
          ward?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_signup_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          approval_status: Database["public"]["Enums"]["customer_approval_status"]
          billing_email: string | null
          billing_phone: string | null
          created_at: string
          customer_type: Database["public"]["Enums"]["customer_type"]
          display_name: string
          id: string
          kra_pin: string | null
          notes: string | null
          status: Database["public"]["Enums"]["customer_status"]
          updated_at: string
        }
        Insert: {
          approval_status?: Database["public"]["Enums"]["customer_approval_status"]
          billing_email?: string | null
          billing_phone?: string | null
          created_at?: string
          customer_type: Database["public"]["Enums"]["customer_type"]
          display_name: string
          id?: string
          kra_pin?: string | null
          notes?: string | null
          status?: Database["public"]["Enums"]["customer_status"]
          updated_at?: string
        }
        Update: {
          approval_status?: Database["public"]["Enums"]["customer_approval_status"]
          billing_email?: string | null
          billing_phone?: string | null
          created_at?: string
          customer_type?: Database["public"]["Enums"]["customer_type"]
          display_name?: string
          id?: string
          kra_pin?: string | null
          notes?: string | null
          status?: Database["public"]["Enums"]["customer_status"]
          updated_at?: string
        }
        Relationships: []
      }
      daily_assignments: {
        Row: {
          assignment_date: string
          created_at: string
          id: string
          route_id: string
          status: Database["public"]["Enums"]["daily_assignment_status"]
          updated_at: string
        }
        Insert: {
          assignment_date: string
          created_at?: string
          id?: string
          route_id: string
          status?: Database["public"]["Enums"]["daily_assignment_status"]
          updated_at?: string
        }
        Update: {
          assignment_date?: string
          created_at?: string
          id?: string
          route_id?: string
          status?: Database["public"]["Enums"]["daily_assignment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_assignments_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          checksum: string | null
          created_at: string
          file_name: string
          id: string
          mime_type: string
          size_bytes: number
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          checksum?: string | null
          created_at?: string
          file_name: string
          id?: string
          mime_type: string
          size_bytes: number
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          checksum?: string | null
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string
          size_bytes?: number
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_assignments: {
        Row: {
          created_at: string
          daily_assignment_id: string
          driver_id: string
          ended_at: string | null
          id: string
          started_at: string | null
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          daily_assignment_id: string
          driver_id: string
          ended_at?: string | null
          id?: string
          started_at?: string | null
          vehicle_id: string
        }
        Update: {
          created_at?: string
          daily_assignment_id?: string
          driver_id?: string
          ended_at?: string | null
          id?: string
          started_at?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_assignments_daily_assignment_id_fkey"
            columns: ["daily_assignment_id"]
            isOneToOne: false
            referencedRelation: "daily_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_assignments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_assignments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          created_at: string
          id: string
          license_expiry: string
          license_number: string
          status: Database["public"]["Enums"]["driver_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          license_expiry: string
          license_number: string
          status?: Database["public"]["Enums"]["driver_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          license_expiry?: string
          license_number?: string
          status?: Database["public"]["Enums"]["driver_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drivers_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      failed_collections: {
        Row: {
          collection_id: string
          created_at: string
          id: string
          notes: string | null
          reason_code: Database["public"]["Enums"]["collection_status_reason"]
          rescheduled_collection_id: string | null
        }
        Insert: {
          collection_id: string
          created_at?: string
          id?: string
          notes?: string | null
          reason_code: Database["public"]["Enums"]["collection_status_reason"]
          rescheduled_collection_id?: string | null
        }
        Update: {
          collection_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          reason_code?: Database["public"]["Enums"]["collection_status_reason"]
          rescheduled_collection_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "failed_collections_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: true
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "failed_collections_rescheduled_collection_id_fkey"
            columns: ["rescheduled_collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_transactions: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string
          id: string
          notes: string | null
          reference_id: string
          reference_table: string
          transaction_type: Database["public"]["Enums"]["financial_transaction_type"]
        }
        Insert: {
          amount_cents: number
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id: string
          id?: string
          notes?: string | null
          reference_id: string
          reference_table: string
          transaction_type: Database["public"]["Enums"]["financial_transaction_type"]
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string
          id?: string
          notes?: string | null
          reference_id?: string
          reference_table?: string
          transaction_type?: Database["public"]["Enums"]["financial_transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          amount_cents: number
          collection_id: string | null
          created_at: string
          description: string
          id: string
          invoice_id: string
          quantity: number
          subscription_id: string | null
          unit_price_cents: number
        }
        Insert: {
          amount_cents: number
          collection_id?: string | null
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          quantity?: number
          subscription_id?: string | null
          unit_price_cents: number
        }
        Update: {
          amount_cents?: number
          collection_id?: string | null
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          subscription_id?: string | null
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          currency: string
          customer_id: string
          due_date: string
          id: string
          invoice_number: string
          issue_date: string
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal_cents: number
          tax_cents: number
          total_cents: number
          updated_at: string
          voided_reason: string | null
        }
        Insert: {
          created_at?: string
          currency?: string
          customer_id: string
          due_date: string
          id?: string
          invoice_number: string
          issue_date: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_cents: number
          tax_cents?: number
          total_cents: number
          updated_at?: string
          voided_reason?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          customer_id?: string
          due_date?: string
          id?: string
          invoice_number?: string
          issue_date?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
          updated_at?: string
          voided_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          customer_id: string
          description: string
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          financial_transaction_id: string
          id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          customer_id: string
          description: string
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          financial_transaction_id: string
          id?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          customer_id?: string
          description?: string
          entry_type?: Database["public"]["Enums"]["ledger_entry_type"]
          financial_transaction_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_financial_transaction_id_fkey"
            columns: ["financial_transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_records: {
        Row: {
          cost_cents: number | null
          created_at: string
          currency: string
          description: string | null
          id: string
          maintenance_type: string
          next_due_date: string | null
          odometer_km: number | null
          performed_at: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          cost_cents?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          maintenance_type: string
          next_due_date?: string | null
          odometer_km?: number | null
          performed_at: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          cost_cents?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          maintenance_type?: string
          next_due_date?: string | null
          odometer_km?: number | null
          performed_at?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_records_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      mpesa_callback_records: {
        Row: {
          created_at: string
          id: string
          payment_intent_id: string | null
          processed_at: string | null
          processing_error: string | null
          raw_payload: Json
          received_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          payment_intent_id?: string | null
          processed_at?: string | null
          processing_error?: string | null
          raw_payload: Json
          received_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          payment_intent_id?: string | null
          processed_at?: string | null
          processing_error?: string | null
          raw_payload?: Json
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mpesa_callback_records_payment_intent_id_fkey"
            columns: ["payment_intent_id"]
            isOneToOne: false
            referencedRelation: "mpesa_payment_intents"
            referencedColumns: ["id"]
          },
        ]
      }
      mpesa_payment_intents: {
        Row: {
          amount_cents: number
          checkout_request_id: string | null
          created_at: string
          customer_id: string
          id: string
          idempotency_key: string
          invoice_id: string | null
          merchant_request_id: string | null
          phone_number: string
          status: Database["public"]["Enums"]["mpesa_intent_status"]
          updated_at: string
        }
        Insert: {
          amount_cents: number
          checkout_request_id?: string | null
          created_at?: string
          customer_id: string
          id?: string
          idempotency_key: string
          invoice_id?: string | null
          merchant_request_id?: string | null
          phone_number: string
          status?: Database["public"]["Enums"]["mpesa_intent_status"]
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          checkout_request_id?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          idempotency_key?: string
          invoice_id?: string | null
          merchant_request_id?: string | null
          phone_number?: string
          status?: Database["public"]["Enums"]["mpesa_intent_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mpesa_payment_intents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_payment_intents_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      mpesa_transactions: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          mpesa_receipt_number: string
          payment_id: string | null
          payment_intent_id: string
          phone_number: string
          transacted_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          mpesa_receipt_number: string
          payment_id?: string | null
          payment_intent_id: string
          phone_number: string
          transacted_at: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          mpesa_receipt_number?: string
          payment_id?: string | null
          payment_intent_id?: string
          phone_number?: string
          transacted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mpesa_transactions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_transactions_payment_intent_id_fkey"
            columns: ["payment_intent_id"]
            isOneToOne: false
            referencedRelation: "mpesa_payment_intents"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          attempted_at: string
          created_at: string
          error_message: string | null
          id: string
          notification_id: string
          provider: string
          provider_message_id: string | null
          status: Database["public"]["Enums"]["notification_delivery_status"]
        }
        Insert: {
          attempted_at?: string
          created_at?: string
          error_message?: string | null
          id?: string
          notification_id: string
          provider: string
          provider_message_id?: string | null
          status: Database["public"]["Enums"]["notification_delivery_status"]
        }
        Update: {
          attempted_at?: string
          created_at?: string
          error_message?: string | null
          id?: string
          notification_id?: string
          provider?: string
          provider_message_id?: string | null
          status?: Database["public"]["Enums"]["notification_delivery_status"]
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          id: string
          recipient_customer_contact_id: string | null
          recipient_profile_id: string | null
          related_id: string | null
          related_table: string | null
          status: Database["public"]["Enums"]["notification_status"]
          template_code: string
          updated_at: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          recipient_customer_contact_id?: string | null
          recipient_profile_id?: string | null
          related_id?: string | null
          related_table?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          template_code: string
          updated_at?: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          recipient_customer_contact_id?: string | null
          recipient_profile_id?: string | null
          related_id?: string | null
          related_table?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          template_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_customer_contact_id_fkey"
            columns: ["recipient_customer_contact_id"]
            isOneToOne: false
            referencedRelation: "customer_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json | null
          related_id: string | null
          related_table: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json | null
          related_id?: string | null
          related_table?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json | null
          related_id?: string | null
          related_table?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operational_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          invoice_id: string
          payment_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          invoice_id: string
          payment_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          invoice_id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          customer_id: string
          id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          received_at: string
          reference: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          customer_id: string
          id?: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          received_at: string
          reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          customer_id?: string
          id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          received_at?: string
          reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          code: string
          created_at: string
          description: string
          id: string
        }
        Insert: {
          code: string
          created_at?: string
          description: string
          id?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          kind: Database["public"]["Enums"]["profile_kind"]
          last_seen_at: string | null
          phone: string | null
          role_id: string
          status: Database["public"]["Enums"]["profile_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
          kind: Database["public"]["Enums"]["profile_kind"]
          last_seen_at?: string | null
          phone?: string | null
          role_id: string
          status?: Database["public"]["Enums"]["profile_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          kind?: Database["public"]["Enums"]["profile_kind"]
          last_seen_at?: string | null
          phone?: string | null
          role_id?: string
          status?: Database["public"]["Enums"]["profile_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address_line: string
          county: string
          created_at: string
          customer_id: string
          id: string
          latitude: number | null
          longitude: number | null
          name: string | null
          property_type: Database["public"]["Enums"]["property_type"]
          status: Database["public"]["Enums"]["property_status"]
          sub_county: string | null
          updated_at: string
          ward: string | null
        }
        Insert: {
          address_line: string
          county?: string
          created_at?: string
          customer_id: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          property_type: Database["public"]["Enums"]["property_type"]
          status?: Database["public"]["Enums"]["property_status"]
          sub_county?: string | null
          updated_at?: string
          ward?: string | null
        }
        Update: {
          address_line?: string
          county?: string
          created_at?: string
          customer_id?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          property_type?: Database["public"]["Enums"]["property_type"]
          status?: Database["public"]["Enums"]["property_status"]
          sub_county?: string | null
          updated_at?: string
          ward?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          created_at: string
          document_id: string | null
          id: string
          issued_at: string
          payment_id: string
          receipt_number: string
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          id?: string
          issued_at?: string
          payment_id: string
          receipt_number: string
        }
        Update: {
          created_at?: string
          document_id?: string | null
          id?: string
          issued_at?: string
          payment_id?: string
          receipt_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_batches: {
        Row: {
          batch_type: string
          created_at: string
          id: string
          performed_by: string | null
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["reconciliation_batch_status"]
          updated_at: string
        }
        Insert: {
          batch_type: string
          created_at?: string
          id?: string
          performed_by?: string | null
          period_end: string
          period_start: string
          status?: Database["public"]["Enums"]["reconciliation_batch_status"]
          updated_at?: string
        }
        Update: {
          batch_type?: string
          created_at?: string
          id?: string
          performed_by?: string | null
          period_end?: string
          period_start?: string
          status?: Database["public"]["Enums"]["reconciliation_batch_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_batches_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_items: {
        Row: {
          amount_cents: number
          batch_id: string
          created_at: string
          external_reference: string
          id: string
          match_status: Database["public"]["Enums"]["reconciliation_match_status"]
          notes: string | null
          payment_id: string | null
        }
        Insert: {
          amount_cents: number
          batch_id: string
          created_at?: string
          external_reference: string
          id?: string
          match_status?: Database["public"]["Enums"]["reconciliation_match_status"]
          notes?: string | null
          payment_id?: string | null
        }
        Update: {
          amount_cents?: number
          batch_id?: string
          created_at?: string
          external_reference?: string
          id?: string
          match_status?: Database["public"]["Enums"]["reconciliation_match_status"]
          notes?: string | null
          payment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_items_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      refund_payouts: {
        Row: {
          amount_cents: number
          completed_at: string | null
          created_at: string
          currency: string
          customer_id: string
          external_reference: string | null
          financial_transaction_id: string
          id: string
          initiated_by: string | null
          payout_method: Database["public"]["Enums"]["refund_payout_method"]
          status: Database["public"]["Enums"]["refund_payout_status"]
          updated_at: string
        }
        Insert: {
          amount_cents: number
          completed_at?: string | null
          created_at?: string
          currency?: string
          customer_id: string
          external_reference?: string | null
          financial_transaction_id: string
          id?: string
          initiated_by?: string | null
          payout_method: Database["public"]["Enums"]["refund_payout_method"]
          status?: Database["public"]["Enums"]["refund_payout_status"]
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          completed_at?: string | null
          created_at?: string
          currency?: string
          customer_id?: string
          external_reference?: string | null
          financial_transaction_id?: string
          id?: string
          initiated_by?: string | null
          payout_method?: Database["public"]["Enums"]["refund_payout_method"]
          status?: Database["public"]["Enums"]["refund_payout_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_payouts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_payouts_financial_transaction_id_fkey"
            columns: ["financial_transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_payouts_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          label: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          label: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          label?: string
        }
        Relationships: []
      }
      route_stops: {
        Row: {
          created_at: string
          id: string
          route_id: string
          sequence_number: number
          service_address_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          route_id: string
          sequence_number: number
          service_address_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          route_id?: string
          sequence_number?: number
          service_address_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_stops_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_stops_service_address_id_fkey"
            columns: ["service_address_id"]
            isOneToOne: false
            referencedRelation: "service_addresses"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          area: string | null
          created_at: string
          default_driver_id: string | null
          default_vehicle_id: string | null
          id: string
          name: string
          status: Database["public"]["Enums"]["property_status"]
          updated_at: string
        }
        Insert: {
          area?: string | null
          created_at?: string
          default_driver_id?: string | null
          default_vehicle_id?: string | null
          id?: string
          name: string
          status?: Database["public"]["Enums"]["property_status"]
          updated_at?: string
        }
        Update: {
          area?: string | null
          created_at?: string
          default_driver_id?: string | null
          default_vehicle_id?: string | null
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["property_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "routes_default_driver_id_fkey"
            columns: ["default_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_default_vehicle_id_fkey"
            columns: ["default_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_addresses: {
        Row: {
          access_notes: string | null
          created_at: string
          customer_id: string
          id: string
          label: string
          latitude: number | null
          longitude: number | null
          property_id: string
          status: Database["public"]["Enums"]["service_address_status"]
          updated_at: string
        }
        Insert: {
          access_notes?: string | null
          created_at?: string
          customer_id: string
          id?: string
          label: string
          latitude?: number | null
          longitude?: number | null
          property_id: string
          status?: Database["public"]["Enums"]["service_address_status"]
          updated_at?: string
        }
        Update: {
          access_notes?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          label?: string
          latitude?: number | null
          longitude?: number | null
          property_id?: string
          status?: Database["public"]["Enums"]["service_address_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_addresses_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      service_plan_prices: {
        Row: {
          created_at: string
          currency: string
          effective_from: string
          effective_to: string | null
          id: string
          price_cents: number
          service_plan_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          price_cents: number
          service_plan_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          price_cents?: number
          service_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_plan_prices_service_plan_id_fkey"
            columns: ["service_plan_id"]
            isOneToOne: false
            referencedRelation: "service_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      service_plans: {
        Row: {
          code: string
          container_type: string | null
          created_at: string
          default_frequency: Database["public"]["Enums"]["plan_frequency"]
          id: string
          is_active: boolean
          name: string
          updated_at: string
          waste_type: Database["public"]["Enums"]["waste_type"]
        }
        Insert: {
          code: string
          container_type?: string | null
          created_at?: string
          default_frequency: Database["public"]["Enums"]["plan_frequency"]
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          waste_type: Database["public"]["Enums"]["waste_type"]
        }
        Update: {
          code?: string
          container_type?: string | null
          created_at?: string
          default_frequency?: Database["public"]["Enums"]["plan_frequency"]
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          waste_type?: Database["public"]["Enums"]["waste_type"]
        }
        Relationships: []
      }
      staff_documents: {
        Row: {
          created_at: string
          document_id: string
          document_type: Database["public"]["Enums"]["staff_document_type"]
          expiry_date: string | null
          id: string
          staff_profile_id: string
        }
        Insert: {
          created_at?: string
          document_id: string
          document_type: Database["public"]["Enums"]["staff_document_type"]
          expiry_date?: string | null
          id?: string
          staff_profile_id: string
        }
        Update: {
          created_at?: string
          document_id?: string
          document_type?: Database["public"]["Enums"]["staff_document_type"]
          expiry_date?: string | null
          id?: string
          staff_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_documents_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_profiles: {
        Row: {
          created_at: string
          department: string | null
          employee_number: string
          hire_date: string | null
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          employee_number: string
          hire_date?: string | null
          id: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          department?: string | null
          employee_number?: string
          hire_date?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_history: {
        Row: {
          change_type: Database["public"]["Enums"]["subscription_change_type"]
          changed_by: string | null
          created_at: string
          id: string
          new_value: Json
          previous_value: Json | null
          subscription_id: string
        }
        Insert: {
          change_type: Database["public"]["Enums"]["subscription_change_type"]
          changed_by?: string | null
          created_at?: string
          id?: string
          new_value: Json
          previous_value?: Json | null
          subscription_id: string
        }
        Update: {
          change_type?: Database["public"]["Enums"]["subscription_change_type"]
          changed_by?: string | null
          created_at?: string
          id?: string
          new_value?: Json
          previous_value?: Json | null
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_history_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          contract_id: string
          created_at: string
          customer_id: string
          end_date: string | null
          frequency: Database["public"]["Enums"]["plan_frequency"]
          id: string
          service_address_id: string
          service_plan_id: string
          start_date: string
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          customer_id: string
          end_date?: string | null
          frequency: Database["public"]["Enums"]["plan_frequency"]
          id?: string
          service_address_id: string
          service_plan_id: string
          start_date: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          customer_id?: string
          end_date?: string | null
          frequency?: Database["public"]["Enums"]["plan_frequency"]
          id?: string
          service_address_id?: string
          service_plan_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_service_address_id_fkey"
            columns: ["service_address_id"]
            isOneToOne: false
            referencedRelation: "service_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_service_plan_id_fkey"
            columns: ["service_plan_id"]
            isOneToOne: false
            referencedRelation: "service_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          from_status: string | null
          id: string
          reason: string | null
          to_status: string
          vehicle_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          reason?: string | null
          to_status: string
          vehicle_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          reason?: string | null
          to_status?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_status_history_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          capacity_kg: number | null
          created_at: string
          id: string
          registration_number: string
          status: Database["public"]["Enums"]["vehicle_status"]
          updated_at: string
          vehicle_type: string | null
        }
        Insert: {
          capacity_kg?: number | null
          created_at?: string
          id?: string
          registration_number: string
          status?: Database["public"]["Enums"]["vehicle_status"]
          updated_at?: string
          vehicle_type?: string | null
        }
        Update: {
          capacity_kg?: number | null
          created_at?: string
          id?: string
          registration_number?: string
          status?: Database["public"]["Enums"]["vehicle_status"]
          updated_at?: string
          vehicle_type?: string | null
        }
        Relationships: []
      }
      waste_collection_requests: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          notes: string | null
          requested_date: string
          resulting_collection_id: string | null
          service_address_id: string
          status: Database["public"]["Enums"]["request_status"]
          updated_at: string
          waste_type: Database["public"]["Enums"]["waste_type"]
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          notes?: string | null
          requested_date: string
          resulting_collection_id?: string | null
          service_address_id: string
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
          waste_type: Database["public"]["Enums"]["waste_type"]
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          notes?: string | null
          requested_date?: string
          resulting_collection_id?: string | null
          service_address_id?: string
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
          waste_type?: Database["public"]["Enums"]["waste_type"]
        }
        Relationships: [
          {
            foreignKeyName: "waste_collection_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waste_collection_requests_resulting_collection_id_fkey"
            columns: ["resulting_collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waste_collection_requests_service_address_id_fkey"
            columns: ["service_address_id"]
            isOneToOne: false
            referencedRelation: "service_addresses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      citext:
        | {
            Args: {
              "": boolean
            }
            Returns: string
          }
        | {
            Args: {
              "": string
            }
            Returns: string
          }
        | {
            Args: {
              "": unknown
            }
            Returns: string
          }
      citext_hash: {
        Args: {
          "": string
        }
        Returns: number
      }
      citextin: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      citextout: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      citextrecv: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      citextsend: {
        Args: {
          "": string
        }
        Returns: string
      }
      customer_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      customer_approval_status: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      driver_record_collection: {
        Args: {
          p_action: string
          p_collection_id: string
          p_document_id?: string
          p_latitude?: number
          p_longitude?: number
          p_notes?: string
          p_reason?: Database["public"]["Enums"]["collection_status_reason"]
        }
        Returns: undefined
      }
      review_customer_signup: {
        Args: {
          p_approve: boolean
          p_customer_id: string
          p_note?: string
        }
        Returns: undefined
      }
      get_customer_statement: {
        Args: {
          p_customer_id?: string
        }
        Returns: Json
      }
      is_assigned_driver: {
        Args: {
          p_daily_assignment_id: string
        }
        Returns: boolean
      }
      is_assigned_driver_for_collection: {
        Args: {
          p_collection_id: string
        }
        Returns: boolean
      }
      owns_service_address: {
        Args: {
          p_service_address_id: string
        }
        Returns: boolean
      }
      set_service_plan_price: {
        Args: {
          p_service_plan_id: string
          p_price_cents: number
          p_effective_from: string
        }
        Returns: {
          created_at: string
          currency: string
          effective_from: string
          effective_to: string | null
          id: string
          price_cents: number
          service_plan_id: string
        }
      }
      transition_collection_status: {
        Args: {
          p_collection_id: string
          p_new_status: Database["public"]["Enums"]["collection_status"]
          p_reason_code?: Database["public"]["Enums"]["collection_status_reason"]
          p_actor_id?: string
        }
        Returns: {
          arrived_at: string | null
          collection_request_id: string | null
          completed_at: string | null
          created_at: string
          daily_assignment_id: string | null
          id: string
          scheduled_date: string
          service_address_id: string
          status: Database["public"]["Enums"]["collection_status"]
          subscription_id: string | null
          updated_at: string
          weight_kg: number | null
        }
      }
      transition_contract_status: {
        Args: {
          p_contract_id: string
          p_new_status: Database["public"]["Enums"]["contract_status"]
        }
        Returns: {
          billing_terms: Database["public"]["Enums"]["contract_billing_terms"]
          contract_number: string
          created_at: string
          customer_id: string
          end_date: string | null
          id: string
          signed_document_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["contract_status"]
          updated_at: string
        }
      }
      transition_invoice_status: {
        Args: {
          p_invoice_id: string
          p_new_status: Database["public"]["Enums"]["invoice_status"]
        }
        Returns: {
          created_at: string
          currency: string
          customer_id: string
          due_date: string
          id: string
          invoice_number: string
          issue_date: string
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal_cents: number
          tax_cents: number
          total_cents: number
          updated_at: string
          voided_reason: string | null
        }
      }
      transition_mpesa_intent_status: {
        Args: {
          p_intent_id: string
          p_new_status: Database["public"]["Enums"]["mpesa_intent_status"]
        }
        Returns: {
          amount_cents: number
          checkout_request_id: string | null
          created_at: string
          customer_id: string
          id: string
          idempotency_key: string
          invoice_id: string | null
          merchant_request_id: string | null
          phone_number: string
          status: Database["public"]["Enums"]["mpesa_intent_status"]
          updated_at: string
        }
      }
      transition_subscription_status: {
        Args: {
          p_subscription_id: string
          p_new_status: Database["public"]["Enums"]["subscription_status"]
          p_changed_by?: string
        }
        Returns: {
          contract_id: string
          created_at: string
          customer_id: string
          end_date: string | null
          frequency: Database["public"]["Enums"]["plan_frequency"]
          id: string
          service_address_id: string
          service_plan_id: string
          start_date: string
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
        }
      }
      user_role: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
    }
    Enums: {
      billing_cycle: "monthly" | "quarterly" | "half_yearly" | "yearly"
      cheque_status: "pending_clearance" | "cleared" | "bounced"
      collection_status:
        | "scheduled"
        | "assigned"
        | "in_progress"
        | "completed"
        | "failed"
        | "rescheduled"
        | "cancelled"
      collection_status_reason:
        | "gate_locked"
        | "customer_absent"
        | "bin_not_out"
        | "customer_cancelled"
        | "operational_cancelled"
        | "weather"
        | "vehicle_issue"
        | "other"
      contract_billing_terms: "prepaid" | "net_15" | "net_30"
      contract_status: "draft" | "active" | "expired" | "terminated"
      customer_approval_status: "pending" | "approved" | "rejected"
      customer_document_type: "contract" | "id_copy" | "kra_pin" | "other"
      customer_status: "active" | "suspended" | "closed"
      customer_type: "individual" | "corporate"
      daily_assignment_status:
        | "planned"
        | "dispatched"
        | "in_progress"
        | "completed"
        | "cancelled"
      driver_status: "active" | "suspended" | "inactive"
      financial_transaction_type:
        | "invoice_issued"
        | "payment_received"
        | "refund_issued"
        | "adjustment"
        | "write_off"
      invoice_status:
        | "draft"
        | "issued"
        | "partially_paid"
        | "paid"
        | "overdue"
        | "void"
      ledger_entry_type: "debit" | "credit"
      mpesa_intent_status:
        | "initiated"
        | "pending"
        | "completed"
        | "failed"
        | "expired"
      notification_channel: "sms" | "email" | "push"
      notification_delivery_status: "sent" | "delivered" | "failed" | "bounced"
      notification_status: "queued" | "sent" | "failed"
      payment_method: "mpesa" | "cheque" | "cash" | "bank_transfer"
      payment_status: "pending" | "confirmed" | "failed" | "reversed"
      plan_frequency: "weekly" | "biweekly" | "monthly" | "on_demand"
      profile_kind: "staff" | "customer"
      profile_status: "active" | "suspended" | "disabled"
      property_status: "active" | "inactive"
      property_type:
        | "residential"
        | "commercial"
        | "industrial"
        | "institutional"
      reconciliation_batch_status:
        | "open"
        | "completed"
        | "completed_with_exceptions"
      reconciliation_match_status: "matched" | "unmatched" | "disputed"
      refund_payout_method: "mpesa_b2c" | "bank_transfer" | "cheque"
      refund_payout_status: "pending" | "completed" | "failed"
      request_status:
        | "submitted"
        | "approved"
        | "scheduled"
        | "rejected"
        | "cancelled"
      service_address_status: "active" | "inactive"
      staff_document_type:
        | "id_copy"
        | "drivers_license"
        | "certification"
        | "other"
      subscription_change_type:
        | "created"
        | "plan_changed"
        | "paused"
        | "resumed"
        | "cancelled"
        | "address_changed"
      subscription_status: "pending" | "active" | "paused" | "cancelled"
      vehicle_status: "active" | "in_maintenance" | "out_of_service"
      waste_type: "general" | "recyclable" | "organic" | "hazardous" | "bulky"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
          versioning_status: string
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
          versioning_status?: string
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
          versioning_status?: string
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      iceberg_namespaces: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          metadata: Json
          name: string
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_namespaces_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
        ]
      }
      iceberg_tables: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          location: string
          name: string
          namespace_id: string
          remote_table_id: string | null
          shard_id: string | null
          shard_key: string | null
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          location: string
          name: string
          namespace_id: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          location?: string
          name?: string
          namespace_id?: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_tables_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iceberg_tables_namespace_id_fkey"
            columns: ["namespace_id"]
            isOneToOne: false
            referencedRelation: "iceberg_namespaces"
            referencedColumns: ["id"]
          },
        ]
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          archived_at: string | null
          bucket_id: string | null
          created_at: string | null
          id: string
          is_delete_marker: boolean
          is_versioned: boolean
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          archived_at?: string | null
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          is_delete_marker?: boolean
          is_versioned?: boolean
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          archived_at?: string | null
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          is_delete_marker?: boolean
          is_versioned?: boolean
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          metadata: Json | null
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: {
          expected_operations: string[]
        }
        Returns: boolean
      }
      allow_only_operation: {
        Args: {
          expected_operation: string
        }
        Returns: boolean
      }
      can_insert_object: {
        Args: {
          bucketid: string
          name: string
          owner: string
          metadata: Json
        }
        Returns: undefined
      }
      extension: {
        Args: {
          name: string
        }
        Returns: string
      }
      filename: {
        Args: {
          name: string
        }
        Returns: string
      }
      foldername: {
        Args: {
          name: string
        }
        Returns: string[]
      }
      get_common_prefix: {
        Args: {
          p_key: string
          p_prefix: string
          p_delimiter: string
        }
        Returns: string
      }
      get_size_by_bucket: {
        Args: Record<PropertyKey, never>
        Returns: {
          size: number
          bucket_id: string
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          prefix_param: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
        }
        Returns: {
          key: string
          id: string
          created_at: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          prefix_param: string
          delimiter_param: string
          max_keys?: number
          start_after?: string
          next_token?: string
          sort_order?: string
        }
        Returns: {
          name: string
          id: string
          metadata: Json
          updated_at: string
          created_at: string
          last_accessed_at: string
        }[]
      }
      operation: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      search: {
        Args: {
          prefix: string
          bucketname: string
          limits?: number
          levels?: number
          offsets?: number
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          name: string
          id: string
          updated_at: string
          created_at: string
          last_accessed_at: string
          metadata: Json
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_prefix: string
          p_bucket_id: string
          p_limit: number
          p_level: number
          p_start_after: string
          p_sort_order: string
          p_sort_column: string
          p_sort_column_after: string
        }
        Returns: {
          key: string
          name: string
          id: string
          updated_at: string
          created_at: string
          last_accessed_at: string
          metadata: Json
        }[]
      }
      search_v2: {
        Args: {
          prefix: string
          bucket_name: string
          limits?: number
          levels?: number
          start_after?: string
          sort_order?: string
          sort_column?: string
          sort_column_after?: string
        }
        Returns: {
          key: string
          name: string
          id: string
          updated_at: string
          created_at: string
          last_accessed_at: string
          metadata: Json
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never


// Convenience re-exports of frequently-used enum unions. The real
// `supabase gen types` output only exposes enums via
// Database["public"]["Enums"][...] or the Enums<> helper above - these
// named aliases exist so application code doesn't have to spell that out
// at every call site. Keep in sync with the actual Postgres enums
// (supabase/migrations/005_operations.sql, 003_commercial.sql) if they
// ever change; regenerating this file will not regenerate these lines.
export type CollectionStatus = Database["public"]["Enums"]["collection_status"];
export type CustomerApprovalStatus = Database["public"]["Enums"]["customer_approval_status"];
export type SubscriptionStatus = Database["public"]["Enums"]["subscription_status"];
