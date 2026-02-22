export type UserRole = "user" | "business" | "admin";
export type FacilityStatus = "pending" | "active" | "suspended";
export type EventStatus = "pending" | "approved" | "rejected";
export type SkillLevel = "beginner" | "intermediate" | "advanced";
export type DocumentStatus = "pending" | "approved" | "rejected";

export interface Database {
    public: {
        PostgrestVersion: "12";
        Tables: {
            profiles: {
                Row: {
                    id: string;
                    role: UserRole;
                    display_name: string | null;
                    avatar_url: string | null;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id: string;
                    role?: UserRole;
                    display_name?: string | null;
                    avatar_url?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    role?: UserRole;
                    display_name?: string | null;
                    avatar_url?: string | null;
                    updated_at?: string;
                };
            };
            sports: {
                Row: { id: number; name: string; icon: string | null };
                Insert: { name: string; icon?: string | null };
                Update: { name?: string; icon?: string | null };
            };
            facilities: {
                Row: {
                    id: string;
                    owner_id: string;
                    name: string;
                    description: string | null;
                    address: string;
                    city: string;
                    postal_code: string;
                    country: string;
                    phone: string | null;
                    website: string | null;
                    location: unknown | null; // PostGIS geography
                    status: FacilityStatus;
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
                    status?: FacilityStatus | string;
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
                    status?: FacilityStatus | string;
                    updated_at?: string;
                    rejection_reason?: string | null;
                };
            };
            facility_sports: {
                Row: { facility_id: string; sport_id: number };
                Insert: { facility_id: string; sport_id: number };
                Update: never;
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
            is_admin: { Args: Record<string, never>; Returns: boolean };
            get_user_role: { Args: Record<string, never>; Returns: string };
        };
        Enums: {
            user_role: UserRole;
            facility_status: FacilityStatus;
            event_status: EventStatus;
            skill_level: SkillLevel;
            document_status: DocumentStatus;
        };
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

// Rich joined types used in the UI
export type FacilityWithDetails = Facility & {
    facility_sports: Array<{ sport_id: number; sports: Sport }>;
    facility_hours: FacilityHours[];
    facility_images: FacilityImage[];
    student_discounts: StudentDiscount[];
    reviews: Array<Review & { profiles: Pick<Profile, "display_name" | "avatar_url"> }>;
};
