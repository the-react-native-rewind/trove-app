export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      invites: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: string
          space_id: string
          status: string
          token: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          space_id: string
          status?: string
          token?: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          space_id?: string
          status?: string
          token?: string
        }
        Relationships: []
      }
      labels: {
        Row: { color: string; id: string; name: string; space_id: string }
        Insert: { color?: string; id?: string; name: string; space_id: string }
        Update: { color?: string; id?: string; name?: string; space_id?: string }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      space_members: {
        Row: {
          created_at: string
          id: string
          role: string
          space_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: string
          space_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          space_id?: string
          user_id?: string
        }
        Relationships: []
      }
      spaces: {
        Row: {
          color: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          owner_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          owner_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      task_attachments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          media_type: string
          path: string
          space_id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          media_type: string
          path: string
          space_id: string
          task_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          media_type?: string
          path?: string
          space_id?: string
          task_id?: string
        }
        Relationships: []
      }
      task_labels: {
        Row: { label_id: string; task_id: string }
        Insert: { label_id: string; task_id: string }
        Update: { label_id?: string; task_id?: string }
        Relationships: []
      }
      tasks: {
        Row: {
          assignee_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          position: number
          priority: string | null
          space_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          position?: number
          priority?: string | null
          space_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          position?: number
          priority?: string | null
          space_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      accept_invite: { Args: { p_token: string }; Returns: string }
      current_space_role: { Args: { p_space_id: string }; Returns: string }
      is_space_member: { Args: { p_space_id: string }; Returns: boolean }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
