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
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id: string;
                    role?: UserRole;
                    display_name?: string | null;
                    avatar_url?: string | null;
                    phone?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    role?: UserRole;
                    display_name?: string | null;
                    avatar_url?: string | null;
                    phone?: string | null;
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
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    owner_id: string;
                    name: string;
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
                };
                Update: {
                    name?: string;
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
            student_discounts: {
                Row: {
                    id: string;
                    facility_id: string;
                    description: string;
                    amount: string | null;
                    valid_until: string | null;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    facility_id: string;
                    description: string;
                    amount?: string | null;
                    valid_until?: string | null;
                };
                Update: {
                    description?: string;
                    amount?: string | null;
                    valid_until?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "student_discounts_facility_id_fkey";
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
                };
                Update: {
                    name?: string;
                    description?: string | null;
                    event_date?: string;
                    status?: EventStatus;
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
            legal_documents: {
                Row: {
                    id: string;
                    facility_id: string;
                    owner_id: string;
                    storage_path: string;
                    status: DocumentStatus;
                    admin_notes: string | null;
                    created_at: string;
                    reviewed_at: string | null;
                };
                Insert: {
                    id?: string;
                    facility_id: string;
                    owner_id: string;
                    storage_path: string;
                    status?: DocumentStatus;
                    admin_notes?: string | null;
                };
                Update: {
                    status?: DocumentStatus;
                    admin_notes?: string | null;
                    reviewed_at?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "legal_documents_facility_id_fkey";
                        columns: ["facility_id"];
                        isOneToOne: false;
                        referencedRelation: "facilities";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "legal_documents_owner_id_fkey";
                        columns: ["owner_id"];
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
                };
                Update: {
                    skill_level?: SkillLevel;
                    post_date?: string;
                    message?: string;
                    location_text?: string | null;
                    is_active?: boolean;
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
                    }
                ];
            };
            email_campaigns: {
                Row: {
                    id: string;
                    admin_id: string;
                    template_name: string;
                    recipient_count: number;
                    sent_at: string;
                };
                Insert: {
                    id?: string;
                    admin_id: string;
                    template_name: string;
                    recipient_count?: number;
                };
                Update: never;
                Relationships: [
                    {
                        foreignKeyName: "email_campaigns_admin_id_fkey";
                        columns: ["admin_id"];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: ["id"];
                    }
                ];
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
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    court_id: string;
                    date: string;
                    start_time: string;
                    end_time: string;
                    is_booked?: boolean;
                };
                Update: {
                    is_booked?: boolean;
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
                };
                Update: {
                    num_players?: number;
                    status?: BookingStatus;
                    notes?: string | null;
                    reminder_sent?: boolean;
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
        };
        Views: Record<string, never>;
        Functions: {
            facilities_within_radius: {
                Args: {
                    lat: number;
                    lng: number;
                    radius_km?: number;
                    sport_filter?: number | null;
                    discount_only?: boolean;
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
export type StudentDiscount = Database["public"]["Tables"]["student_discounts"]["Row"];
export type Review = Database["public"]["Tables"]["reviews"]["Row"];
export type Event = Database["public"]["Tables"]["events"]["Row"];
export type LegalDocument = Database["public"]["Tables"]["legal_documents"]["Row"];
export type MatchmakingPost = Database["public"]["Tables"]["matchmaking_posts"]["Row"];
export type EmailCampaign = Database["public"]["Tables"]["email_campaigns"]["Row"];
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
    student_discounts: StudentDiscount[];
    reviews: Array<Review & { profiles: Pick<Profile, "display_name" | "avatar_url"> }>;
};

export type CourtWithSport = Court & { sports: Sport | null };

export type BookingWithDetails = Booking & {
    courts: CourtWithSport & { facilities: Pick<Facility, "id" | "name" | "address" | "city"> };
    profiles: Pick<Profile, "display_name" | "avatar_url">;
    payments: Payment[];
    booking_guests: BookingGuest[];
};
