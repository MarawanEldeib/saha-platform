# 🏟️ Saha Platform — Full Project Report

> **Saha** is a sports facility directory and community platform built for students in Stuttgart and Baden-Württemberg, Germany. It connects students with local sports facilities, enables facility owners to list and manage their venues, and helps athletes find teammates through a community matchmaking board.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Architecture](#3-architecture)
4. [Database Schema](#4-database-schema)
5. [User Roles](#5-user-roles)
6. [Application Features](#6-application-features)
   - [Public Pages](#61-public-pages)
   - [Authentication System](#62-authentication-system)
   - [Business Dashboard](#63-business-dashboard)
   - [Admin Panel](#64-admin-panel)
7. [Internationalization (i18n)](#7-internationalization-i18n)
8. [Security & Compliance](#8-security--compliance)
9. [File & Storage System](#9-file--storage-system)
10. [Email System](#10-email-system)
11. [Directory Structure](#11-directory-structure)
12. [Getting Started](#12-getting-started)
13. [Environment Variables](#13-environment-variables)

---

## 1. Project Overview

Saha is a **Next.js 16** web application that serves three distinct audiences:

| Audience | What They Get |
|---|---|
| **Students / Players** | Discover nearby sports facilities, filter by sport or discount, read reviews, join the matchmaking board, and attend events |
| **Facility Owners (Business)** | Register their business, list their facility, manage photos/hours/sports/discounts, submit events for approval |
| **Platform Admins** | Approve/reject facility listings and events, run email outreach campaigns, view platform analytics |

The platform is focused on the **Stuttgart and Baden-Württemberg region of Germany**, but is architected to scale geographically.

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| **Framework** | [Next.js 16](https://nextjs.org) (App Router, React 19, TypeScript 5) |
| **Database** | [Supabase](https://supabase.com) (PostgreSQL 15 with PostGIS + pg_trgm extensions) |
| **Auth** | Supabase Auth (email/password + TOTP-based 2FA via Supabase MFA) |
| **Styling** | Tailwind CSS v4 |
| **UI Components** | Radix UI primitives (Dialog, Dropdown, Avatar, Select, Tabs, Toast, Label, Separator, Slot) |
| **Icons** | Lucide React |
| **Forms** | React Hook Form + Zod validation |
| **Charts** | Recharts |
| **Maps** | Leaflet + React Leaflet |
| **Email** | Resend (transactional + bulk campaign emails via `@react-email/components`) |
| **i18n** | next-intl (English + German) |
| **Date Handling** | date-fns |
| **File Uploads** | react-dropzone |
| **Animation** | Babel React Compiler (experimental) |

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Next.js 16 App                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │  Public Pages│  │  Auth Pages  │  │  Protected Dashboards │  │
│  │  (SSR / RSC) │  │  (SSR / RSC) │  │  Business + Admin     │  │
│  └──────────────┘  └──────────────┘  └───────────────────────┘  │
│              ↑                    ↑                              │
│         Server Actions       Route Handlers                      │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Supabase                                │
│  ┌────────────────┐  ┌────────────┐  ┌────────────────────┐    │
│  │  Auth (JWT)    │  │  PostgreSQL│  │  Storage           │    │
│  │  + MFA (TOTP)  │  │  +PostGIS  │  │  (facility-images, │    │
│  └────────────────┘  └────────────┘  │   legal-documents) │    │
│                                      └────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────┐
│   Resend                 │
│   (Transactional Email + │
│    CSV Campaign Outreach) │
└──────────────────────────┘
```

The app uses **Next.js App Router with React Server Components** for all data fetching. Server Actions handle mutations (form submissions, approvals). The client only receives serialised props — no raw Supabase credentials are ever exposed to the browser.

---

## 4. Database Schema

The Supabase PostgreSQL database contains the following tables (all with Row Level Security enabled):

### Core Tables

| Table | Description |
|---|---|
| `profiles` | Extends `auth.users`. One row per user. Stores `role`, `display_name`, `avatar_url`. Auto-created on sign-up via a PostgreSQL trigger. |
| `sports` | Reference table of 20 sport types (Football, Basketball, Swimming, Gym, etc.) with icon names. |
| `facilities` | Core facility listings. Includes name, address, city, postal code, phone, website, PostGIS `GEOGRAPHY(POINT, 4326)` location, and approval status. |
| `facility_sports` | Many-to-many join between facilities and sports. |
| `facility_hours` | Operating hours per day of week (0–6 = Mon–Sun) with open/close times and `is_closed` flag. |
| `facility_images` | Ordered gallery images stored in Supabase Storage (`facility-images` public bucket). |
| `student_discounts` | Discount offers attached to a facility (description, amount, validity date). |
| `reviews` | User reviews on facilities (1–5 star rating + comment). One review per user per facility, enforced by a UNIQUE constraint. |
| `events` | Events tied to a facility, submitted by a business user and requiring admin approval before going live. |
| `legal_documents` | Business registration documents (e.g. Gewerbeanmeldung) uploaded to the private `legal-documents` bucket for admin review. |
| `matchmaking_posts` | Community board posts where users look for training partners. Filtered by sport, skill level, and date. |
| `email_campaigns` | Log of admin email outreach campaigns sent via Resend (template name, recipient count, timestamp). |

### Custom Enums

| Enum | Values |
|---|---|
| `user_role` | `user`, `business`, `admin` |
| `facility_status` | `pending`, `active`, `suspended` |
| `event_status` | `pending`, `approved`, `rejected` |
| `skill_level` | `beginner`, `intermediate`, `advanced` |
| `document_status` | `pending`, `approved`, `rejected` |

### Geospatial Features

The `facilities` table uses a **PostGIS** geography column (`GEOGRAPHY(POINT, 4326)`) with a GIST spatial index. A custom PostgreSQL function `facilities_within_radius(lat, lng, radius_km, sport_filter, discount_only)` powers the map's radius-based search — it returns all active facilities within a given kilometre radius, sorted by distance, with optional sport and discount filters.

### Performance Indexes

- `idx_facilities_location` — GIST index for geospatial queries
- `idx_facilities_owner` — Facility lookup by owner
- `idx_facilities_status` — Status filtering
- `idx_reviews_facility` — Reviews per facility
- `idx_events_facility`, `idx_events_status`
- `idx_matchmaking_sport`

---

## 5. User Roles

The platform has **three distinct user roles**, each granting different permissions:

### 👤 Student / Player (`user`)
- Browse and search the public facility directory
- View facility details, hours, sports, student discounts
- View and attend events
- Write reviews for facilities
- Post on the matchmaking board to find training partners

### 🏢 Business / Facility Owner (`business`)
- Everything a student can do, plus:
- Complete the **4-step business onboarding** flow to register their facility
- Manage their facility listing (description, photos, hours, sports, discounts)
- Submit events for admin approval
- Track event approval status in the dashboard

### 🛡️ Admin (`admin`)
- Everything everyone else can do, plus:
- Access the admin panel at `/admin`
- View platform-wide statistics (pending facilities, pending events, total users)
- Review and approve/reject pending facility applications (with optional rejection notes)
- View uploaded legal documents
- Approve/reject events submitted by businesses
- Send email outreach campaigns via CSV upload
- View analytics charts (signups, active businesses, page views)

---

## 6. Application Features

### 6.1 Public Pages

#### 🏠 Home Page (`/`)
- **Hero section** with animated gradient background, primary CTA ("Explore the Map"), and secondary CTA ("Join the Community")
- **Live stats bar** showing real-time counts of facilities, sports, registered students, and cities — all fetched in parallel from the database
- **Feature cards** highlighting: Interactive Map, Student Discounts, Matchmaking Board, Verified Reviews
- **Smart CTA section** for facility owners — hidden for students, shows "Go to Dashboard" for existing business accounts, or "Register Your Business" for guests

#### 🗺️ Map Page (`/map`)
- Full-screen interactive map powered by **Leaflet** and **React Leaflet**
- Search bar to filter by sport, facility name, or location
- Toggle filter for **student discounts only**
- All-sports dropdown selector
- Sidebar listing nearby facilities sorted by distance
- Clicking a facility opens a detail card with a "View Details" link
- Geospatial data powered by PostGIS `facilities_within_radius` database function

#### 🏟️ Facility Detail Page (`/facilities/[id]`)
- Facility header with name, address, and status badge
- Photo gallery (images from Supabase Storage)
- Opening hours for each day of the week
- List of sports offered
- Student discounts section (description, amount, validity date)
- Upcoming approved events
- Reviews section:
  - Average star rating display
  - Existing user reviews with stars and comments
  - Authenticated users can write/submit a new review (one per user per facility)

#### 👥 Community Board (`/community`)
- **Matchmaking board** for finding training partners
- Filterable by sport and skill level
- Post cards showing: sport, skill level (beginner/intermediate/advanced), date, location text, user name, message
- Authenticated users can create new posts via an inline form
- Guest users see a prompt to log in before posting

#### 📅 Events Page (`/events`)
- Browse all **admin-approved** upcoming sports events
- Displays: event name, date, venue (facility name), and organiser
- Events displayed from soonest to latest

---

### 6.2 Authentication System

Located at `/[locale]/(auth)/`:

| Route | Feature |
|---|---|
| `/login` | Email + password login |
| `/register` | Account creation with role selection (Student or Business) |
| `/forgot-password` | Password reset request — sends email via Supabase |
| `/reset-password` | Set new password from reset link |
| `/2fa/setup` | TOTP 2FA setup — shows QR code to scan with Google Authenticator / Authy |
| `/2fa/verify` | Enter 6-digit TOTP code on login when 2FA is active |

**Key details:**
- All auth actions use **Next.js Server Actions** (`actions.ts`)
- Registration flow automatically creates a `profiles` row via PostgreSQL trigger
- Role is passed at registration as user metadata and stored in the `profiles.role` column
- Supabase session cookies are managed via `@supabase/ssr` middleware
- 2FA uses **Supabase MFA** (TOTP-based)

---

### 6.3 Business Dashboard

Located at `/[locale]/dashboard/` — accessible only to users with role `business` or `admin`.

#### Overview Page
- Welcome message with the user's display name
- Current facility listing status badge (Pending / Active / Suspended)
- Prompt to complete onboarding if no facility exists yet

#### Onboarding Flow (`/dashboard/onboarding`) — Multi-step wizard
Business users who haven't listed a facility are guided through a **4-step onboarding** form:

| Step | Content |
|---|---|
| **Step 1 — Facility Details** | Name, description, address, city, postal code, phone, website |
| **Step 2 — Sports Offered** | Multi-select from the 20 sport categories |
| **Step 3 — Legal Documents** | Upload business registration document (Gewerbeanmeldung or equivalent) — PDF/image up to 10 MB, stored in the private `legal-documents` Supabase Storage bucket |
| **Step 4 — Review & Submit** | Summary view before submitting for admin review |

On successful submission, the facility is created with `status = 'pending'` and the document is uploaded. Admin is notified to review.

#### Manage Facility (`/dashboard/facility`)
- Edit facility description
- Manage the **photo gallery**: drag-and-drop image upload via `react-dropzone`, reorder or remove images
- Edit **opening hours** for each day of the week (individual open/close times or mark as closed)
- Manage **sports offered** (multi-select)
- Manage **student discounts**: add/remove discounts with description, amount/percentage, and optional expiry date
- All changes saved via Server Actions

#### Events Management (`/dashboard/events`)
- View all events submitted by the business, with status (pending/approved/rejected)
- Submit new events (name, date, description) associated with the business's facility
- All submitted events start as `status = 'pending'` and require admin approval before appearing publicly

#### Account Settings (`/dashboard/settings`)
- Update display name
- View email (read-only)
- **Two-Factor Authentication section**: see 2FA status, set up or manage 2FA

---

### 6.4 Admin Panel

Located at `/[locale]/admin/` — accessible only to users with role `admin`.

#### Admin Overview
- **Stats dashboard** with 3 metric cards:
  - Pending Facilities count
  - Pending Events count
  - Total registered users
- **Recent Pending Facilities** list with facility name, city, submission date, status badge, and direct "Review" link
- **Recent Pending Events** list with event name, hosting facility, date, status badge, and "Review" link
- Quick link to Email Outreach

#### Facility Approval Queue (`/admin/facilities`)
- Full list of all pending facility applications
- Each row: facility name, city, owner, submission date, status badge
- Click through to individual review page

#### Facility Review Detail (`/admin/facilities/[id]`)
- Full facility information (name, address, contact, sports, description)
- List of uploaded legal documents with download/view links
- **Approve** button: sets facility status to `active`, visible on map and listings
- **Reject** button: sets facility status, optionally stores an admin-provided rejection reason in the database
- Approval/rejection is handled via Server Action (`actions.ts`)

#### Event Approval Queue (`/admin/events`)
- All pending events with name, submitting business, hosting facility, and event date
- Click through to individual event review page

#### Event Review Detail (`/admin/events/[id]`)
- Full event information (name, description, date, facility)
- **Approve** button: sets event status to `approved`, event becomes publicly visible
- **Reject** button: sets event status to `rejected`

#### Email Outreach (`/admin/outreach`)
- Upload a **CSV file** with columns: `name`, `email`
- The system parses the CSV and shows a row count preview
- Select an **email template** from predefined templates
- Click **Send Campaign** to trigger a personalised Resend email for each contact
- Each sent campaign is logged in the `email_campaigns` table (template name, recipient count, timestamp)

#### Analytics (`/admin/analytics`)
- Charts powered by **Recharts**
- Metrics: New Signups, Active Businesses, Page Views
- Configurable time period: Last 7 Days, Last 30 Days, Last 90 Days

---

## 7. Internationalization (i18n)

The entire application is **fully translated** in two languages:

| Language | Locale Code | File |
|---|---|---|
| English | `en` | `messages/en.json` |
| German | `de` | `messages/de.json` |

**Implementation:**
- Powered by **next-intl** with full App Router support
- All routes use a `[locale]` dynamic segment (e.g. `/en/map`, `/de/map`)
- Locale is detected from the URL and stored in middleware
- Users can switch languages via the language toggle in the navigation bar
- Translated strings cover: navigation, home page, map, facility detail, community, events, all auth flows, dashboard, and admin panel

---

## 8. Security & Compliance

### Row Level Security (RLS)

Every table in the database has **PostgreSQL Row Level Security enabled**. Policies are defined for each table and operation:

| Principle | Implementation |
|---|---|
| Public read of active facilities | `facilities_select_public` — status = 'active' OR owner OR admin |
| Business-only write access | `facilities_insert_business` — requires `business` or `admin` role |
| Owner-only edits | Facilities, images, hours, discounts updatable only by the owning user or an admin |
| Admin-only deletes | Facilities can only be deleted by admins |
| One review per user | Database UNIQUE constraint on `(facility_id, user_id)` in `reviews` |
| Legal document privacy | Private Supabase Storage bucket; RLS restricts access to document owner + admin |

### Helper Functions

Two `SECURITY DEFINER` PostgreSQL functions enable safe, non-leaking role checks:
- `public.is_admin()` — Returns boolean
- `public.get_user_role()` — Returns the calling user's role string

### Authentication Security
- Passwords hashed by Supabase Auth (bcrypt)
- JWT session tokens with short expiry, refreshed via `@supabase/ssr` middleware
- Optional **TOTP-based Two-Factor Authentication** for all accounts
- Route-level auth guards using server-side session checks with automatic redirect

### GDPR Compliance
- **Cookie consent banner** on all pages — no tracking cookies without consent
- **`gdpr_delete_expired_accounts()`** PostgreSQL function for automated account deletion (designed to be scheduled via `pg_cron` at 2 AM daily)
- Legal documents stored in a **private** Supabase Storage bucket, inaccessible to the public
- No analytics or third-party tracking scripts beyond what's strictly necessary

---

## 9. File & Storage System

Supabase Storage is used for two distinct purposes:

| Bucket | Type | Contents | Access |
|---|---|---|---|
| `facility-images` | **Public** | Facility gallery photos uploaded by business owners | Anyone can read; authenticated users write their own folder |
| `legal-documents` | **Private** | Business registration documents (Gewerbeanmeldung, etc.) | Owner + Admin only |

Storage RLS policies are scoped by folder name (user UUID), preventing cross-user access.

---

## 10. Email System

The platform uses **[Resend](https://resend.com)** for all outgoing email:

| Email Type | Trigger | Details |
|---|---|---|
| Email Verification | On registration | Sent by Supabase Auth |
| Password Reset | Forgot password request | Sent by Supabase Auth |
| 2FA Codes | On login with 2FA enabled | Handled by Supabase MFA |
| Outreach Campaigns | Admin-triggered via CSV upload | Personalised bulk email via Resend API; logged in `email_campaigns` table |

Email templates are built using **`@react-email/components`** for type-safe, React-rendered HTML email templates.

---

## 11. Directory Structure

```
saha-app/
├── messages/
│   ├── en.json              # English translations
│   └── de.json              # German translations
├── public/                  # Static assets
├── src/
│   ├── app/
│   │   ├── layout.tsx       # Root layout
│   │   ├── page.tsx         # Root redirect
│   │   └── [locale]/        # Localised routes
│   │       ├── page.tsx     # Home page
│   │       ├── layout.tsx   # Nav + footer shell
│   │       ├── (auth)/      # Auth routes
│   │       │   ├── login/
│   │       │   ├── register/
│   │       │   ├── forgot-password/
│   │       │   ├── reset-password/
│   │       │   └── 2fa/     # Setup + verify
│   │       ├── map/         # Interactive map
│   │       ├── facilities/  # Facility detail pages
│   │       ├── community/   # Matchmaking board
│   │       ├── events/      # Public events listing
│   │       ├── dashboard/   # Business portal
│   │       │   ├── page.tsx (overview)
│   │       │   ├── onboarding/
│   │       │   ├── facility/
│   │       │   ├── events/
│   │       │   └── settings/
│   │       └── admin/       # Admin panel
│   │           ├── page.tsx (overview)
│   │           ├── facilities/
│   │           ├── events/
│   │           └── outreach/
│   ├── components/
│   │   ├── ui/              # Reusable UI primitives
│   │   │   ├── Button.tsx
│   │   │   ├── Badge.tsx    # FacilityStatusBadge, EventStatusBadge
│   │   │   └── ...
│   │   ├── facility/        # Facility-specific components
│   │   ├── layout/          # Nav, footer, sidebar
│   │   └── map/             # Leaflet map components
│   ├── lib/
│   │   ├── supabase/        # Client, server, middleware factories
│   │   ├── utils.ts         # Shared utilities
│   │   └── validations.ts   # Zod schemas for all forms
│   ├── types/
│   │   └── database.ts      # TypeScript types for DB tables
│   └── i18n/                # next-intl routing + config
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql   # Full schema (tables, RLS, functions)
│       ├── 003_add_rejection_reason.sql
│       └── 20260222_sport_suggestions.sql
├── next.config.ts
├── tsconfig.json
└── package.json
```

---

## 12. Getting Started

### Prerequisites
- Node.js 20+
- A Supabase project (free tier works)
- A Resend account (for email)

### 1. Clone the repository

```bash
git clone https://github.com/MarawanEldeib/saha-platform.git
cd saha-platform
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. In the SQL Editor, run the migration scripts in order:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/003_add_rejection_reason.sql`
   - `supabase/migrations/20260222_sport_suggestions.sql`
3. Enable the **PostGIS** and **pg_trgm** extensions (Settings → Extensions)
4. In Storage, verify the `facility-images` (public) and `legal-documents` (private) buckets were created by the migration

### 4. Configure environment variables

Copy the example file and fill in your credentials:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your Supabase URL, anon key, and Resend API key (see [Environment Variables](#13-environment-variables)).

### 5. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 6. Create an admin account

After registering a normal account, manually update the role in the Supabase dashboard:

```sql
UPDATE public.profiles SET role = 'admin' WHERE id = '<your-user-uuid>';
```

---

## 13. Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon/public key (public) |
| `RESEND_API_KEY` | Resend API key for sending emails |
| `NEXT_PUBLIC_SITE_URL` | Full URL of the deployed app (e.g. `https://saha.example.com`) |

> **⚠️ Never commit `.env.local` to version control.** It is already included in `.gitignore`.

---

## Summary

Saha is a **production-ready, full-stack sports facility platform** with:

- ✅ Multi-role user system (student, business, admin)
- ✅ Geospatial search with PostGIS
- ✅ Interactive Leaflet map
- ✅ Multi-step business onboarding with document upload
- ✅ Admin approval workflows for facilities and events
- ✅ Community matchmaking board
- ✅ Student discount discovery
- ✅ Verified user reviews (1 per user per facility)
- ✅ Two-factor authentication (TOTP)
- ✅ Email outreach campaigns with CSV upload
- ✅ Analytics dashboard (charts)
- ✅ Full English + German localisation
- ✅ GDPR-compliant cookie consent and data deletion
- ✅ Comprehensive Row Level Security on all database tables
- ✅ Private storage for sensitive legal documents

---

*Report generated: March 2026 · Built with Next.js 16, Supabase, Tailwind CSS, and ❤️*
