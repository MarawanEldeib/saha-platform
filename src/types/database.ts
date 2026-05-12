export type UserRole = "user" | "business" | "admin";
export type FacilityStatus = "pending" | "active" | "suspended";
export type EventStatus = "pending" | "approved" | "rejected";
export type SkillLevel = "beginner" | "intermediate" | "advanced";
export type DocumentStatus = "pending" | "approved" | "rejected";
export type BookingStatus = "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
export type PaymentStatus = "pending" | "succeeded" | "failed" | "refunded";

export interface Database {
    public: {
        Tables: {
            profiles: {
                Row: {
                    id: string;
                    role: UserRole;
                    display_name: string | null;
                    avatar_url: string | null;
                    phone: string | null;
                    phone_verified: boolean;
                    phone_verification_sid: string | null;
                    trn: string | null;
                    no_show_count: number;
                    skill_rating: number | null;
                    deletion_requested_at: string | null;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id: string;
                    role?: UserRole;
                    display_name?: string | null;
                    avatar_url?: string | null;
                    phone?: string | null;
                    phone_verified?: boolean;
                    phone_verification_sid?: string | null;
                    trn?: string | null;
                    no_show_count?: number;
                    skill_rating?: number | null;
                    deletion_requested_at?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    role?: UserRole;
                    display_name?: string | null;
                    avatar_url?: string | null;
                    phone?: string | null;
                    phone_verified?: boolean;
                    phone_verification_sid?: string | null;
                    trn?: string | null;
                    no_show_count?: number;
                    skill_rating?: number | null;
                    deletion_requested_at?: string | null;
                    updated_at?: string;
                };
                Relationships: [];
            };
            sports: {
                Row: { id: number; name: string; icon: string | null };
                Insert: { name: string; icon?: string | null };
                Update: { name?: string; icon?: string | null };
                Relationships: [];
            };
            facilities: {
                Row: {
                    id: string;
                    owner_id: string;
                    name: string;
                    slug: string;
                    description: string | null;
                    address: string;
                    city: string;
                    postal_code: string | null;
                    country: string;
                    phone: string | null;
                    website: string | null;
                    location: unknown | null;
                    status: FacilityStatus;
                    rejection_reason: string | null;
                    stripe_account_id: string | null;
                    currency: string;
                    trn: string | null;
                    invoice_seq: number;
                    has_prayer_room: boolean;
                    has_wudu_area: boolean;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    owner_id: string;
                    name: string;
                    slug?: string;
                    description?: string | null;
                    address: string;
                    city: string;
                    postal_code?: string | null;
                    country?: string;
                    phone?: string | null;
                    website?: string | null;
                    location?: unknown | null;
                    status?: FacilityStatus;
                    stripe_account_id?: string | null;
                    currency?: string;
                    trn?: string | null;
                    has_prayer_room?: boolean;
                    has_wudu_area?: boolean;
                };
                Update: {
                    name?: string;
                    slug?: string;
                    description?: string | null;
                    address?: string;
                    city?: string;
                    postal_code?: string | null;
                    country?: string;
                    phone?: string | null;
                    website?: string | null;
                    location?: unknown | null;
                    status?: FacilityStatus;
                    rejection_reason?: string | null;
                    stripe_account_id?: string | null;
                    currency?: string;
                    trn?: string | null;
                    has_prayer_room?: boolean;
                    has_wudu_area?: boolean;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "facilities_owner_id_fkey";
                        columns: ["owner_id"];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: ["id"];
                    }
                ];
            };
            facility_sports: {
                Row: { facility_id: string; sport_id: number };
                Insert: { facility_id: string; sport_id: number };
                Update: never;
                Relationships: [
                    {
                        foreignKeyName: "facility_sports_facility_id_fkey";
                        columns: ["facility_id"];
                        isOneToOne: false;
                        referencedRelation: "facilities";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "facility_sports_sport_id_fkey";
                        columns: ["sport_id"];
                        isOneToOne: false;
                        referencedRelation: "sports";
                        referencedColumns: ["id"];
                    }
                ];
            };
            facility_hours: {
                Row: {
                    id: string;
                    facility_id: string;
                    day_of_week: number;
                    open_time: string | null;
                    close_time: string | null;
                    is_closed: boolean;
                };
                Insert: {
                    id?: string;
                    facility_id: string;
                    day_of_week: number;
                    open_time?: string | null;
                    close_time?: string | null;
                    is_closed?: boolean;
                };
                Update: {
                    open_time?: string | null;
                    close_time?: string | null;
                    is_closed?: boolean;
                };
                Relationships: [
                    {
                        foreignKeyName: "facility_hours_facility_id_fkey";
                        columns: ["facility_id"];
                        isOneToOne: false;
                        referencedRelation: "facilities";
                        referencedColumns: ["id"];
                    }
                ];
            };
            facility_images: {
                Row: {
                    id: string;
                    facility_id: string;
                    storage_path: string;
                    display_order: number;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    facility_id: string;
                    storage_path: string;
                    display_order?: number;
                };
                Update: {
                    storage_path?: string;
                    display_order?: number;
                };
                Relationships: [
                    {
                        foreignKeyName: "facility_images_facility_id_fkey";
                        columns: ["facility_id"];
                        isOneToOne: false;
                        referencedRelation: "facilities";
                        referencedColumns: ["id"];
                    }
                ];
            };
            reviews: {
                Row: {
                    id: string;
                    facility_id: string;
                    user_id: string;
                    rating: number;
                    comment: string | null;
                    created_at: string;
                    updated_at: string;
                    hidden_at: string | null;
                    hidden_by: string | null;
                    hidden_reason: string | null;
                };
                Insert: {
                    id?: string;
                    facility_id: string;
                    user_id: string;
                    rating: number;
                    comment?: string | null;
                };
                Update: {
                    rating?: number;
                    comment?: string | null;
                    updated_at?: string;
                    hidden_at?: string | null;
                    hidden_by?: string | null;
                    hidden_reason?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "reviews_facility_id_fkey";
                        columns: ["facility_id"];
                        isOneToOne: false;
                        referencedRelation: "facilities";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "reviews_user_id_fkey";
                        columns: ["user_id"];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: ["id"];
                    }
                ];
            };
            events: {
                Row: {
                    id: string;
                    facility_id: string;
                    submitted_by: string;
                    name: string;
                    description: string | null;
                    event_date: string;
                    status: EventStatus;
                    tags: string[];
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    facility_id: string;
                    submitted_by: string;
                    name: string;
                    description?: string | null;
                    event_date: string;
                    status?: EventStatus;
                    tags?: string[];
                };
                Update: {
                    name?: string;
                    description?: string | null;
                    event_date?: string;
                    status?: EventStatus;
                    tags?: string[];
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "events_facility_id_fkey";
                        columns: ["facility_id"];
                        isOneToOne: false;
                        referencedRelation: "facilities";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "events_submitted_by_fkey";
                        columns: ["submitted_by"];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: ["id"];
                    }
                ];
            };
            matchmaking_posts: {
                Row: {
                    id: string;
                    user_id: string;
                    sport_id: number | null;
                    skill_level: SkillLevel;
                    post_date: string;
                    message: string;
                    location_text: string | null;
                    is_active: boolean;
                    created_at: string;
                    preferred_times: string[] | null;
                    // SAH-152 Phase 1: Match semantics layered over the existing table.
                    title: string;
                    scheduled_for: string;
                    court_id: string | null;
                    format: string;
                    capacity: number;
                    status: "open" | "live" | "completed" | "cancelled";
                    gate: "open" | "request" | "invite_only";
                    duration_minutes: number;
                };
                Insert: {
                    id?: string;
                    user_id: string;
                    sport_id?: number | null;
                    skill_level?: SkillLevel;
                    post_date: string;
                    message: string;
                    location_text?: string | null;
                    is_active?: boolean;
                    preferred_times?: string[] | null;
                    title?: string;
                    scheduled_for?: string;
                    court_id?: string | null;
                    format?: string;
                    capacity?: number;
                    status?: "open" | "live" | "completed" | "cancelled";
                    gate?: "open" | "request" | "invite_only";
                    duration_minutes?: number;
                };
                Update: {
                    skill_level?: SkillLevel;
                    post_date?: string;
                    message?: string;
                    location_text?: string | null;
                    is_active?: boolean;
                    preferred_times?: string[] | null;
                    title?: string;
                    scheduled_for?: string;
                    court_id?: string | null;
                    format?: string;
                    capacity?: number;
                    status?: "open" | "live" | "completed" | "cancelled";
                    gate?: "open" | "request" | "invite_only";
                    duration_minutes?: number;
                };
                Relationships: [
                    {
                        foreignKeyName: "matchmaking_posts_user_id_fkey";
                        columns: ["user_id"];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "matchmaking_posts_sport_id_fkey";
                        columns: ["sport_id"];
                        isOneToOne: false;
                        referencedRelation: "sports";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "matchmaking_posts_court_id_fkey";
                        columns: ["court_id"];
                        isOneToOne: false;
                        referencedRelation: "courts";
                        referencedColumns: ["id"];
                    }
                ];
            };
            match_participants: {
                Row: {
                    match_id: string;
                    user_id: string;
                    role: "host" | "player";
                    joined_at: string;
                };
                Insert: {
                    match_id: string;
                    user_id: string;
                    role?: "host" | "player";
                    joined_at?: string;
                };
                Update: {
                    role?: "host" | "player";
                };
                Relationships: [];
            };
            match_invites: {
                Row: {
                    id: string;
                    match_id: string;
                    invitee_user_id: string;
                    inviter_id: string;
                    status: "pending" | "accepted" | "declined" | "expired" | "cancelled";
                    sent_at: string;
                    responded_at: string | null;
                };
                Insert: {
                    id?: string;
                    match_id: string;
                    invitee_user_id: string;
                    inviter_id: string;
                    status?: "pending" | "accepted" | "declined" | "expired" | "cancelled";
                };
                Update: {
                    status?: "pending" | "accepted" | "declined" | "expired" | "cancelled";
                    responded_at?: string | null;
                };
                Relationships: [];
            };
            match_join_requests: {
                Row: {
                    id: string;
                    match_id: string;
                    requester_user_id: string;
                    status: "pending" | "accepted" | "declined";
                    created_at: string;
                    responded_at: string | null;
                };
                Insert: {
                    id?: string;
                    match_id: string;
                    requester_user_id: string;
                    status?: "pending" | "accepted" | "declined";
                };
                Update: {
                    status?: "pending" | "accepted" | "declined";
                    responded_at?: string | null;
                };
                Relationships: [];
            };
            match_messages: {
                Row: {
                    id: string;
                    match_id: string;
                    sender_id: string;
                    body: string;
                    read_at: string | null;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    match_id: string;
                    sender_id: string;
                    body: string;
                };
                Update: {
                    read_at?: string | null;
                };
                Relationships: [];
            };
            player_contacts: {
                Row: {
                    owner_id: string;
                    contact_user_id: string;
                    created_at: string;
                };
                Insert: {
                    owner_id: string;
                    contact_user_id: string;
                };
                Update: never;
                Relationships: [];
            };
            player_groups: {
                Row: {
                    id: string;
                    owner_id: string;
                    name: string;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    owner_id: string;
                    name: string;
                };
                Update: {
                    name?: string;
                };
                Relationships: [];
            };
            player_group_members: {
                Row: {
                    group_id: string;
                    member_user_id: string;
                    added_at: string;
                };
                Insert: {
                    group_id: string;
                    member_user_id: string;
                };
                Update: never;
                Relationships: [];
            };
            conversations: {
                Row: {
                    id: string;
                    player_low_id: string;
                    player_high_id: string;
                    matchmaking_post_id: string | null;
                    last_message_at: string;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    player_low_id: string;
                    player_high_id: string;
                    matchmaking_post_id?: string | null;
                };
                Update: never;
                Relationships: [];
            };
            messages: {
                Row: {
                    id: string;
                    conversation_id: string;
                    sender_id: string;
                    body: string;
                    read_at: string | null;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    conversation_id: string;
                    sender_id: string;
                    body: string;
                };
                Update: {
                    read_at?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "messages_conversation_id_fkey";
                        columns: ["conversation_id"];
                        isOneToOne: false;
                        referencedRelation: "conversations";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "messages_sender_id_fkey";
                        columns: ["sender_id"];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: ["id"];
                    }
                ];
            };
            web_push_subscriptions: {
                Row: {
                    id: string;
                    user_id: string;
                    endpoint: string;
                    p256dh: string;
                    auth_key: string;
                    user_agent: string | null;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    user_id: string;
                    endpoint: string;
                    p256dh: string;
                    auth_key: string;
                    user_agent?: string | null;
                };
                Update: {
                    endpoint?: string;
                    p256dh?: string;
                    auth_key?: string;
                };
                Relationships: [];
            };
            courts: {
                Row: {
                    id: string;
                    facility_id: string;
                    sport_id: number | null;
                    name: string;
                    capacity: number;
                    price_per_hour: number;
                    is_active: boolean;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    facility_id: string;
                    sport_id?: number | null;
                    name: string;
                    capacity?: number;
                    price_per_hour: number;
                    is_active?: boolean;
                };
                Update: {
                    sport_id?: number | null;
                    name?: string;
                    capacity?: number;
                    price_per_hour?: number;
                    is_active?: boolean;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "courts_facility_id_fkey";
                        columns: ["facility_id"];
                        isOneToOne: false;
                        referencedRelation: "facilities";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "courts_sport_id_fkey";
                        columns: ["sport_id"];
                        isOneToOne: false;
                        referencedRelation: "sports";
                        referencedColumns: ["id"];
                    }
                ];
            };
            court_availability: {
                Row: {
                    id: string;
                    court_id: string;
                    date: string;
                    start_time: string;
                    end_time: string;
                    is_booked: boolean;
                    session_type: "mixed" | "family" | "women_only" | "men_only";
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    court_id: string;
                    date: string;
                    start_time: string;
                    end_time: string;
                    is_booked?: boolean;
                    session_type?: "mixed" | "family" | "women_only" | "men_only";
                };
                Update: {
                    is_booked?: boolean;
                    session_type?: "mixed" | "family" | "women_only" | "men_only";
                };
                Relationships: [
                    {
                        foreignKeyName: "court_availability_court_id_fkey";
                        columns: ["court_id"];
                        isOneToOne: false;
                        referencedRelation: "courts";
                        referencedColumns: ["id"];
                    }
                ];
            };
            bookings: {
                Row: {
                    id: string;
                    availability_id: string;
                    court_id: string;
                    player_id: string;
                    date: string;
                    start_time: string;
                    end_time: string;
                    num_players: number;
                    total_price: number;
                    currency: string;
                    status: BookingStatus;
                    qr_code_token: string;
                    notes: string | null;
                    reminder_sent: boolean;
                    review_prompt_sent_at: string | null;
                    invoice_number: string | null;
                    invoiced_at: string | null;
                    move_count: number;
                    recurring_group_id: string | null;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    availability_id: string;
                    court_id: string;
                    player_id: string;
                    date: string;
                    start_time: string;
                    end_time: string;
                    num_players?: number;
                    total_price: number;
                    currency?: string;
                    status?: BookingStatus;
                    qr_code_token?: string;
                    notes?: string | null;
                    reminder_sent?: boolean;
                    move_count?: number;
                    recurring_group_id?: string | null;
                };
                Update: {
                    num_players?: number;
                    status?: BookingStatus;
                    notes?: string | null;
                    reminder_sent?: boolean;
                    invoice_number?: string | null;
                    invoiced_at?: string | null;
                    availability_id?: string;
                    date?: string;
                    start_time?: string;
                    end_time?: string;
                    move_count?: number;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "bookings_availability_id_fkey";
                        columns: ["availability_id"];
                        isOneToOne: false;
                        referencedRelation: "court_availability";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "bookings_court_id_fkey";
                        columns: ["court_id"];
                        isOneToOne: false;
                        referencedRelation: "courts";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "bookings_player_id_fkey";
                        columns: ["player_id"];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: ["id"];
                    }
                ];
            };
            payments: {
                Row: {
                    id: string;
                    booking_id: string;
                    stripe_payment_intent_id: string | null;
                    stripe_checkout_session_id: string | null;
                    amount: number;
                    currency: string;
                    status: PaymentStatus;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    booking_id: string;
                    stripe_payment_intent_id?: string | null;
                    stripe_checkout_session_id?: string | null;
                    amount: number;
                    currency?: string;
                    status?: PaymentStatus;
                };
                Update: {
                    stripe_payment_intent_id?: string | null;
                    stripe_checkout_session_id?: string | null;
                    status?: PaymentStatus;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "payments_booking_id_fkey";
                        columns: ["booking_id"];
                        isOneToOne: false;
                        referencedRelation: "bookings";
                        referencedColumns: ["id"];
                    }
                ];
            };
            booking_guests: {
                Row: {
                    id: string;
                    booking_id: string;
                    name: string | null;
                    email: string | null;
                    invited_at: string;
                    confirmed_at: string | null;
                };
                Insert: {
                    id?: string;
                    booking_id: string;
                    name?: string | null;
                    email?: string | null;
                    invited_at?: string;
                    confirmed_at?: string | null;
                };
                Update: {
                    name?: string | null;
                    email?: string | null;
                    confirmed_at?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "booking_guests_booking_id_fkey";
                        columns: ["booking_id"];
                        isOneToOne: false;
                        referencedRelation: "bookings";
                        referencedColumns: ["id"];
                    }
                ];
            };
            stripe_events: {
                Row: {
                    id: string;
                    type: string;
                    received_at: string;
                };
                Insert: {
                    id: string;
                    type: string;
                    received_at?: string;
                };
                Update: Record<string, never>;
                Relationships: [];
            };
            wallet_balances: {
                Row: {
                    user_id: string;
                    credit_aed: number;
                    bookings_at_last_award: number;
                    updated_at: string;
                };
                Insert: {
                    user_id: string;
                    credit_aed?: number;
                    bookings_at_last_award?: number;
                };
                Update: {
                    credit_aed?: number;
                    bookings_at_last_award?: number;
                    updated_at?: string;
                };
                Relationships: [];
            };
            wallet_transactions: {
                Row: {
                    id: string;
                    user_id: string;
                    amount_aed: number;
                    reason: "booking_milestone" | "spend" | "refund" | "admin";
                    booking_id: string | null;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    user_id: string;
                    amount_aed: number;
                    reason: "booking_milestone" | "spend" | "refund" | "admin";
                    booking_id?: string | null;
                };
                Update: never;
                Relationships: [];
            };
            audit_log: {
                Row: {
                    id: string;
                    actor_id: string | null;
                    actor_role: string;
                    action: string;
                    target_type: string;
                    target_id: string | null;
                    metadata: Record<string, unknown> | null;
                    ip: string | null;
                    user_agent: string | null;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    actor_id?: string | null;
                    actor_role: string;
                    action: string;
                    target_type: string;
                    target_id?: string | null;
                    metadata?: Record<string, unknown> | null;
                    ip?: string | null;
                    user_agent?: string | null;
                    created_at?: string;
                };
                Update: Record<string, never>;
                Relationships: [];
            };
        };
        Views: Record<string, never>;
        Functions: {
            facilities_within_radius: {
                Args: {
                    lat: number;
                    lng: number;
                    radius_km?: number;
                    sport_filter?: number | null;
                };
                Returns: Array<{
                    id: string;
                    name: string;
                    description: string | null;
                    address: string;
                    city: string;
                    location: unknown;
                    status: FacilityStatus;
                    distance_m: number;
                }>;
            };
            is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
            get_user_role: { Args: Record<PropertyKey, never>; Returns: string };
        };
        Enums: {
            user_role: UserRole;
            facility_status: FacilityStatus;
            event_status: EventStatus;
            skill_level: SkillLevel;
            document_status: DocumentStatus;
            booking_status: BookingStatus;
            payment_status: PaymentStatus;
        };
        CompositeTypes: Record<string, never>;
    };
}

// Convenience row types
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Sport = Database["public"]["Tables"]["sports"]["Row"];
export type Facility = Database["public"]["Tables"]["facilities"]["Row"];
export type FacilityHours = Database["public"]["Tables"]["facility_hours"]["Row"];
export type FacilityImage = Database["public"]["Tables"]["facility_images"]["Row"];
export type Review = Database["public"]["Tables"]["reviews"]["Row"];
export type Event = Database["public"]["Tables"]["events"]["Row"];
export type MatchmakingPost = Database["public"]["Tables"]["matchmaking_posts"]["Row"];
export type Court = Database["public"]["Tables"]["courts"]["Row"];
export type CourtAvailability = Database["public"]["Tables"]["court_availability"]["Row"];
export type Booking = Database["public"]["Tables"]["bookings"]["Row"];
export type Payment = Database["public"]["Tables"]["payments"]["Row"];
export type BookingGuest = Database["public"]["Tables"]["booking_guests"]["Row"];

// Rich joined types used in the UI
export type FacilityWithDetails = Facility & {
    facility_sports: Array<{ sport_id: number; sports: Sport }>;
    facility_hours: FacilityHours[];
    facility_images: FacilityImage[];
    reviews: Array<Review & { profiles: Pick<Profile, "display_name" | "avatar_url"> }>;
};

export type CourtWithSport = Court & { sports: Sport | null };

export type BookingWithDetails = Booking & {
    courts: CourtWithSport & { facilities: Pick<Facility, "id" | "name" | "address" | "city"> };
    profiles: Pick<Profile, "display_name" | "avatar_url">;
    payments: Payment[];
    booking_guests: BookingGuest[];
};
