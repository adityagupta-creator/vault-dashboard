# SafeGold Vault Dashboard — Complete Technical Documentation

---

## 1. PROJECT OVERVIEW

SafeGold Vault Dashboard is a bullion trade operations management system built for SafeGold. It tracks client orders, supplier purchases, vault inventory, and manages user access control. The frontend is a React single-page application (SPA) deployed to GitHub Pages. The entire backend runs on Supabase (PostgreSQL database, authentication, Realtime subscriptions, and Edge Functions). Email notifications are sent via Resend.

**Live URL:** https://adityagupta-creator.github.io/vault-dashboard/  
**Repository:** https://github.com/adityagupta-creator/vault-dashboard

---

## 2. TECH STACK

| Layer              | Technology                | Version  |
|--------------------|---------------------------|----------|
| Frontend Framework | React                     | 18.3.1   |
| Language           | TypeScript                | 5.8.3    |
| Build Tool         | Vite                      | 7.3.1    |
| CSS Framework      | Tailwind CSS              | 3.4.17   |
| State Management   | Zustand                   | 4.5.7    |
| Routing            | React Router DOM          | 6.30.3   |
| Icons              | Lucide React              | 0.383.0  |
| Excel Parse/Export | SheetJS (xlsx)            | 0.18.5   |
| Backend / Database | Supabase (PostgreSQL)     | JS 2.99.1|
| Email Notifications| Resend API (Edge Function)| —        |
| Hosting            | GitHub Pages              | —        |
| CI/CD              | GitHub Actions            | —        |

---

## 3. PROJECT STRUCTURE

```
vault-dashboard/
├── .github/workflows/
│   └── deploy-pages.yml            # GitHub Actions: build + deploy to GitHub Pages
├── public/
│   └── 404.html                    # SPA redirect hack for GitHub Pages
├── src/
│   ├── api/
│   │   ├── supabase.ts             # Supabase client init (URL, key, sessionStorage auth)
│   │   └── withTimeout.ts          # Promise timeout wrapper (default 10s)
│   ├── hooks/
│   │   ├── useAppSettings.ts       # Batched app_settings hooks (1 query for all settings)
│   │   └── useRealtimeSync.ts      # Generic Realtime table subscription + polling hook
│   ├── layouts/
│   │   └── MainLayout.tsx          # Sidebar navigation + top bar + page Outlet
│   ├── lib/
│   │   ├── hardikCalculations.ts   # Sales/Purchase/Margin calculation formulas
│   │   ├── hardikConfig.ts         # Row order merge utility, type re-exports
│   │   ├── hardikUtils.ts          # City/salesperson mappings, Indian number formatting
│   │   └── sheetImport.ts          # Excel/CSV/XLS parsing, validation, payload building
│   ├── pages/
│   │   ├── AccessDenied.tsx        # Shown when user lacks page permission
│   │   ├── Admin.tsx               # Admin panel: manage users, roles, page permissions
│   │   ├── ClientOrders.tsx        # Read-only client orders view ("Meghna - Client Orders")
│   │   ├── Dashboard.tsx           # Order monitor (detects new imported orders)
│   │   ├── HardikCoin.tsx          # Full 25-column trade sheet with import/edit/export
│   │   ├── Login.tsx               # Email + password login page
│   │   ├── Settings.tsx            # Password change + email notification config (admin only)
│   │   └── Vault.tsx               # Vault gold inventory management
│   ├── store/
│   │   ├── auth.ts                 # Zustand auth store (persisted to sessionStorage)
│   │   └── permissions.ts          # Zustand permissions store (allowed page slugs)
│   ├── types/
│   │   └── index.ts                # All TypeScript interfaces and type definitions
│   ├── App.tsx                     # Root: routes, auth initialization, permission guards
│   ├── index.css                   # Tailwind imports + global CSS
│   ├── main.tsx                    # React DOM entry point
│   └── vite-env.d.ts              # Vite type declarations
├── supabase/
│   ├── functions/
│   │   └── notify-new-orders/
│   │       └── index.ts            # Edge Function: send email via Resend on import
│   └── migrations/
│       └── 20260317_create_app_settings.sql
├── supabase_access_control.sql     # Full access control schema (roles, pages, permissions)
├── supabase_schema_update.sql      # Adds import_hash + raw_data columns
├── package.json
├── vite.config.ts                  # Vite config (base path for GitHub Pages)
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
└── tsconfig.node.json
```

---

## 4. LOCAL DEVELOPMENT SETUP

### Prerequisites

- Node.js version 20 or higher
- npm (comes with Node.js)
- A Supabase project (already configured — see Section 5)

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/adityagupta-creator/vault-dashboard.git
cd vault-dashboard

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev
# Opens at http://localhost:5173/

# 4. Build for production
npm run build
# Output goes to dist/ folder

# 5. Preview production build locally
npm run preview
```

---

## 5. SUPABASE PROJECT CONFIGURATION

### 5.1 Supabase Project Details

| Setting      | Value                                              |
|--------------|----------------------------------------------------|
| Project URL  | `https://wmvgvwqvmukbclemxrif.supabase.co`         |
| Anon Key     | Hardcoded in `src/api/supabase.ts`                 |
| Region       | (Check Supabase Dashboard > Settings > General)    |

The Supabase client is initialized in `src/api/supabase.ts` with `sessionStorage` for auth tokens (not localStorage). This means closing the browser tab will log the user out.

### 5.2 How to Access the Supabase Dashboard

1. Go to https://supabase.com and sign in
2. Select the project (named something like "vault-dashboard" or by the URL slug `wmvgvwqvmukbclemxrif`)
3. You will see the left sidebar with: Table Editor, SQL Editor, Authentication, Storage, Edge Functions, etc.

### 5.3 Important Supabase Dashboard Settings

#### Disable Email Confirmation (CRITICAL)

This must be disabled for admin-created users to log in immediately:

1. Go to **Supabase Dashboard**
2. Click **Authentication** in the left sidebar
3. Click **Providers** tab
4. Find **Email** provider and click on it
5. **UNCHECK** "Confirm email" toggle
6. Click **Save**

If this is not done, users created from the Admin Panel will get a "Email not confirmed" error when trying to log in.

#### Enable Realtime

These tables must have Realtime enabled:

1. Go to **Supabase Dashboard**
2. Click **Database** > **Replication** in the left sidebar
3. Under "Supabase Realtime", ensure these tables are listed:
   - `client_orders`
   - `supplier_purchases`
   - `vault_logistics`
   - `app_settings`
   - `user_page_permissions`

If any are missing, you can add them via SQL Editor:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE table_name;
```

---

## 6. SUPABASE AUTHENTICATION — STEP-BY-STEP GUIDE

### 6.1 View All Users

1. Go to **Supabase Dashboard**
2. Click **Authentication** in the left sidebar
3. Click the **Users** tab
4. You will see all registered users with their email, created date, and last sign-in

### 6.2 Create a New User (from Supabase Dashboard)

1. Go to **Authentication** > **Users**
2. Click **Add User** > **Create new user**
3. Enter the email and password
4. Check "Auto Confirm User" if email confirmation is not disabled globally
5. Click **Create User**
6. The user will appear in the list. They can now log in.
7. NOTE: A `profiles` row is auto-created on first login with role = 'user'

### 6.3 Create a New User (from Admin Panel in the App)

1. Log in as an admin user
2. Go to **Admin Panel** page
3. Scroll to the "Add User" section at the bottom
4. Enter: Email, Password, Full Name, Role (admin or user)
5. Click **Create User**
6. The user is created in Supabase Auth and a profile is inserted
7. Then assign page permissions using the checkbox matrix above

### 6.4 Delete / Disable a User

**From the App (recommended):**
1. Go to Admin Panel
2. Find the user in the table
3. Click the red trash icon — this sets `is_active = false` (soft delete)
4. The user will see "Your account has been deactivated" when trying to log in

**From Supabase Dashboard (permanent delete):**
1. Go to **Authentication** > **Users**
2. Find the user
3. Click the three-dot menu on the right
4. Click **Delete User**
5. WARNING: This permanently removes them from auth. Their profile row remains in the `profiles` table.

### 6.5 Reset a User's Password

**Option 1 — User changes their own password:**
1. User logs in and goes to **Settings** page
2. Uses the "Change Password" section
3. Enters new password twice and clicks Save

**Option 2 — From Supabase Dashboard:**
1. Go to **Authentication** > **Users**
2. Find the user, click the three-dot menu
3. Click **Send password recovery email**
4. OR: delete the user and recreate with a new password

### 6.6 Make Someone an Admin

**Option 1 — From Admin Panel (if you are already an admin):**
1. Go to Admin Panel
2. Find the user in the table
3. Click the role badge (shows "User")
4. It toggles to "Admin"
5. Admin users automatically get access to all pages

**Option 2 — From Supabase SQL Editor:**

```sql
-- First, find the user's ID:
SELECT id, email, role FROM profiles;

-- Set them as admin (replace the ID):
UPDATE profiles SET role = 'admin' WHERE id = 'paste-user-uuid-here';

-- Grant all page permissions:
INSERT INTO user_page_permissions (user_id, page_id)
SELECT 'paste-user-uuid-here', id FROM app_pages
ON CONFLICT (user_id, page_id) DO NOTHING;
```

### 6.7 Assign Page Permissions to a User

1. Go to **Admin Panel** in the app
2. Find the user in the table
3. Check/uncheck the boxes for each page (Dashboard, Hardik Coin, etc.)
4. Click the **Save** (disk icon) button for that user
5. Changes take effect immediately — the user's sidebar updates in real time

---

## 7. DATABASE SCHEMA

### 7.1 Complete Table List

| Table                     | Purpose                                              |
|---------------------------|------------------------------------------------------|
| `profiles`                | User profiles. Has role (admin/user) and is_active.  |
| `client_orders`           | All trade orders. Main data table.                   |
| `supplier_purchases`      | Purchase records linked to client orders.             |
| `vault_logistics`         | Gold vault inventory.                                |
| `app_settings`            | Key-value store for shared settings (JSON values).   |
| `app_pages`               | Dashboard pages/modules for access control.          |
| `user_page_permissions`   | Maps users to pages they can access.                 |

### 7.2 profiles

Created automatically by Supabase Auth trigger when a user signs up.

| Column     | Type        | Description                           |
|------------|-------------|---------------------------------------|
| id         | uuid (PK)   | Same as auth.users.id                 |
| email      | text        | User's email                          |
| full_name  | text        | Display name                          |
| role       | text        | 'admin' or 'user'                     |
| is_active  | boolean     | false = account deactivated           |
| created_at | timestamptz | Auto-generated                        |
| updated_at | timestamptz | Auto-generated                        |

### 7.3 client_orders (Main Trade Table)

| Column          | Type            | Description                                         |
|-----------------|-----------------|-----------------------------------------------------|
| id              | uuid (PK)       | Auto-generated                                      |
| order_number    | text            | Optional reference number                           |
| order_source    | text            | 'online' or 'offline'                               |
| client_name     | text            | Party name                                          |
| company_name    | text            | Optional                                            |
| order_date      | date            | Trade date                                          |
| order_time      | text            | Trade time (HH:MM:SS)                               |
| delivery_date   | date            | Nullable                                            |
| product_symbol  | text            | e.g. "KOL 50 gm gold bar (9999) with GST"          |
| purity          | text            | e.g. "99.99"                                        |
| quantity        | integer         | Number of items sold                                |
| grams           | numeric         | Total weight in grams                               |
| quoted_rate     | numeric         | Price PER GRAM                                      |
| making_charges  | numeric         | Default 0                                           |
| net_revenue     | numeric         | = grams × quoted_rate                               |
| gst_amount      | numeric         | = net_revenue × 3%                                  |
| tcs_amount      | numeric (null)  | Manually entered, NOT auto-calculated               |
| gross_revenue   | numeric         | = net_revenue + gst_amount                          |
| city            | text            | Auto-extracted from symbol                          |
| trade_status    | text            | 'Online' or 'Offline' (default: 'Online')           |
| import_hash     | text (unique)   | SHA-256 hash for deduplication                      |
| raw_data        | jsonb           | Original row data + derived fields (sales_person)   |
| remarks         | text            | e.g. "Imported from sheet: filename.xlsx"           |
| created_by      | uuid            | User who created the record                         |
| assigned_agent_id | uuid          | Optional agent assignment                           |
| created_at      | timestamptz     | Auto-generated                                      |
| updated_at      | timestamptz     | Auto-generated                                      |

### 7.4 supplier_purchases

Linked to client_orders via `client_order_id` (one-to-one).

| Column                  | Type       | Description                     |
|-------------------------|------------|---------------------------------|
| id                      | uuid (PK)  | Auto-generated                  |
| client_order_id         | uuid (FK)  | References client_orders.id     |
| supplier_name           | text       | Manually entered                |
| supplier_rate           | numeric    | Trade Booked price PER GRAM     |
| supplier_making_charges | numeric    | Default 0                       |
| supplier_grams          | numeric    | = client order grams            |
| supplier_quantity_bought| numeric    | = client order quantity          |
| net_purchase            | numeric    | = grams × supplier_rate         |
| gst_2                   | numeric    | = net_purchase × 3%             |
| gross_purchase          | numeric    | = net_purchase + gst_2          |
| supplier_status         | text       | Status of purchase              |
| booked_by_agent_id      | uuid       | Optional                        |
| booked_at               | timestamptz| When booked                     |
| remarks                 | text       | Optional notes                  |
| created_at              | timestamptz| Auto-generated                  |
| updated_at              | timestamptz| Auto-generated                  |

### 7.5 vault_logistics

| Column         | Type       | Description        |
|----------------|------------|--------------------|
| id             | uuid (PK)  | Auto-generated     |
| vault_name     | text       | Vault identifier   |
| available_gold | numeric    | Grams available    |
| reserved_gold  | numeric    | Grams reserved     |
| delivered_gold | numeric    | Grams delivered    |
| updated_by     | uuid       | Last updater       |
| created_at     | timestamptz| Auto-generated     |
| updated_at     | timestamptz| Auto-generated     |

### 7.6 app_settings

| Column     | Type        | Description                    |
|------------|-------------|--------------------------------|
| key        | text (PK)   | Setting identifier             |
| value      | jsonb       | JSON value                     |
| updated_at | timestamptz | Last update time               |
| updated_by | uuid        | Last updater                   |

**Current keys:**

| Key                        | Value Type        | Purpose                                   |
|----------------------------|-------------------|-------------------------------------------|
| hardik_custom_columns      | JSON array        | Custom columns added to Hardik Coin table  |
| hardik_row_order           | JSON array (UUIDs)| Custom row ordering                        |
| hardik_latest_import_ids   | JSON array (UUIDs)| Recently imported order IDs (for yellow highlighting) |
| notification_emails        | JSON array (strings)| Email addresses for import notifications |

### 7.7 app_pages

| Column        | Type       | Description          |
|---------------|------------|----------------------|
| id            | uuid (PK)  | Auto-generated       |
| slug          | text (unique) | URL-friendly ID   |
| page_name     | text       | Display name         |
| display_order | integer    | Sort order in sidebar|

**Pre-seeded rows:**

| slug           | page_name              | display_order |
|----------------|------------------------|---------------|
| dashboard      | Dashboard              | 1             |
| hardik-coin    | Hardik Coin            | 2             |
| client-orders  | Meghna - Client Orders | 3             |
| vault          | Vault Inventory        | 4             |
| settings       | Settings               | 5             |
| admin          | Admin Panel            | 6             |

### 7.8 user_page_permissions

| Column     | Type       | Description                              |
|------------|------------|------------------------------------------|
| id         | uuid (PK)  | Auto-generated                           |
| user_id    | uuid (FK)  | References profiles.id (CASCADE delete)  |
| page_id    | uuid (FK)  | References app_pages.id (CASCADE delete) |
| granted_by | uuid (FK)  | Admin who granted the permission         |
| created_at | timestamptz| Auto-generated                           |

Unique constraint on (user_id, page_id).

---

## 8. ROW LEVEL SECURITY (RLS)

All tables have RLS enabled. A critical helper function prevents infinite recursion when policies on `profiles` need to check the user's own role:

```sql
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;
```

### Policy Summary

| Table                    | Operation       | Who Can Do It                     |
|--------------------------|-----------------|-----------------------------------|
| profiles                 | SELECT          | Own row OR admin                  |
| profiles                 | UPDATE          | Own row OR admin                  |
| profiles                 | INSERT          | Anyone (for signup)               |
| app_pages                | SELECT          | Anyone authenticated              |
| app_pages                | INSERT/UPDATE/DELETE | Admin only                   |
| user_page_permissions    | SELECT          | Own permissions OR admin          |
| user_page_permissions    | INSERT/UPDATE/DELETE | Admin only                   |
| app_settings             | SELECT/INSERT/UPDATE | Any authenticated user       |
| client_orders            | (depends on your setup) | Check your policies       |
| supplier_purchases       | (depends on your setup) | Check your policies       |
| vault_logistics          | (depends on your setup) | Check your policies       |

---

## 9. FULL SQL SETUP SCRIPTS

Run these in **Supabase Dashboard > SQL Editor** in this order.

### Script 1: Add Import Columns to client_orders

```sql
ALTER TABLE public.client_orders ADD COLUMN IF NOT EXISTS import_hash text UNIQUE;
ALTER TABLE public.client_orders ADD COLUMN IF NOT EXISTS raw_data jsonb;
```

### Script 2: Create app_settings Table

```sql
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read app_settings"
  ON app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert app_settings"
  ON app_settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update app_settings"
  ON app_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

INSERT INTO app_settings (key, value) VALUES
  ('hardik_custom_columns', '[]'::jsonb),
  ('hardik_row_order', '[]'::jsonb),
  ('hardik_latest_import_ids', '[]'::jsonb),
  ('notification_emails', '[]'::jsonb)
ON CONFLICT (key) DO NOTHING;

ALTER PUBLICATION supabase_realtime ADD TABLE app_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE client_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE supplier_purchases;
ALTER PUBLICATION supabase_realtime ADD TABLE vault_logistics;
```

### Script 3: Access Control System

```sql
-- Helper function to check admin role safely
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'); $$;

-- Fix profiles role constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
UPDATE profiles SET role = 'user' WHERE role NOT IN ('admin', 'user');
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'user'));

-- Profiles RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Admin can update profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Enable read access for all users" ON profiles;
DROP POLICY IF EXISTS "Admin can manage profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

CREATE POLICY "profiles_select" ON profiles FOR SELECT
  USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "profiles_update" ON profiles FOR UPDATE
  USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "profiles_insert" ON profiles FOR INSERT
  WITH CHECK (true);

-- Pages table
CREATE TABLE IF NOT EXISTS app_pages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  page_name text NOT NULL,
  display_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

INSERT INTO app_pages (slug, page_name, display_order) VALUES
  ('dashboard', 'Dashboard', 1),
  ('hardik-coin', 'Hardik Coin', 2),
  ('client-orders', 'Meghna - Client Orders', 3),
  ('vault', 'Vault Inventory', 4),
  ('settings', 'Settings', 5),
  ('admin', 'Admin Panel', 6)
ON CONFLICT (slug) DO NOTHING;

-- Permissions table
CREATE TABLE IF NOT EXISTS user_page_permissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  page_id uuid NOT NULL REFERENCES app_pages(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, page_id)
);

-- Pages RLS
ALTER TABLE app_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_pages_select" ON app_pages FOR SELECT USING (true);
CREATE POLICY "app_pages_admin" ON app_pages FOR ALL USING (public.is_admin());

-- Permissions RLS
ALTER TABLE user_page_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "perms_select" ON user_page_permissions FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "perms_admin_insert" ON user_page_permissions FOR INSERT
  WITH CHECK (public.is_admin());
CREATE POLICY "perms_admin_update" ON user_page_permissions FOR UPDATE
  USING (public.is_admin());
CREATE POLICY "perms_admin_delete" ON user_page_permissions FOR DELETE
  USING (public.is_admin());

-- Enable Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE user_page_permissions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

### Script 4: Set Yourself as Admin

```sql
-- Step 1: Find your user ID
SELECT id, email, role FROM profiles;

-- Step 2: Set as admin (replace YOUR_USER_ID with the actual UUID)
UPDATE profiles SET role = 'admin' WHERE id = 'YOUR_USER_ID';

-- Step 3: Grant all page permissions
INSERT INTO user_page_permissions (user_id, page_id)
SELECT 'YOUR_USER_ID', id FROM app_pages
ON CONFLICT (user_id, page_id) DO NOTHING;
```

### Script 5: Trade Status Migration

```sql
ALTER TABLE client_orders DROP CONSTRAINT IF EXISTS client_orders_trade_status_check;
UPDATE client_orders SET trade_status = 'Online'
  WHERE trade_status NOT IN ('Online', 'Offline');
ALTER TABLE client_orders ADD CONSTRAINT client_orders_trade_status_check
  CHECK (trade_status IN ('Online', 'Offline'));
```

---

## 10. BUSINESS LOGIC & FORMULAS

All rates (Quoted Rate, Trade Booked) are stored and displayed as **PER GRAM** (not per 10g).

### 10.1 Sales Side

```
Net Revenue_1  = Grams × Quoted Rate
GST_1          = Net Revenue_1 × 3%
TCS            = Manually entered (blank by default, editable)
Gross Revenue  = Net Revenue_1 + GST_1
```

### 10.2 Purchase Side

```
Net Purchase_2  = Grams × Trade Booked (supplier_rate)
GST_2           = Net Purchase_2 × 3%
Gross Purchase  = Net Purchase_2 + GST_2
```

### 10.3 Margins

```
Trade Margin    = Net Revenue_1 − Net Purchase_2
Trade Margin %  = (Trade Margin / Net Revenue_1) × 100
```

### 10.4 Auto-Populated Fields

**City** — Extracted from the first word (city code) of the Symbol column:

| Code | City        |
|------|-------------|
| PJB  | Mohali      |
| KOL  | Kolkata     |
| BHB  | Bhubaneswar |
| DEL  | Delhi       |
| AGRA | Agra        |
| LKO  | Lucknow     |
| MUM  | Mumbai      |
| AMR  | Amritsar    |
| LDH  | Ludhiana    |

**Sales Person** — Derived from City:

| Cities                          | Sales Person |
|---------------------------------|-------------|
| Delhi, Agra, Lucknow           | Narendra    |
| Kolkata, Bhubaneswar           | Sanjib      |
| Mohali, Amritsar, Ludhiana     | Amritanshu  |
| Mumbai                          | (blank)     |

**Purity** — Parsed from Symbol. "9999" → "99.99", "999" → "99.90", "995" → "99.50".

**Trade Status** — Default "Online". Only two options: "Online" and "Offline".

**TCS** — Blank by default. Manually editable on both Hardik Coin and Client Orders pages.

### 10.5 Where These Formulas Live in Code

| File                          | What It Handles                              |
|-------------------------------|----------------------------------------------|
| `src/lib/hardikCalculations.ts` | recalcSales(), recalcPurchase(), calcMargin() |
| `src/lib/hardikUtils.ts`      | extractCity(), salesPersonFor(), formatRupee() |
| `src/lib/sheetImport.ts`      | Import-time calculations (same formulas)      |

---

## 11. IMPORT / EXPORT LOGIC

### 11.1 Import (Hardik Coin Page)

**Accepted formats:** .xls, .xlsx, .csv, and HTML-table files

**Process:**
1. User clicks "Import" and selects a file
2. File is parsed via SheetJS (xlsx library)
3. Columns are validated — needs at minimum: Date (or Time with date), Party Name (or Name/Firm), and Quantity or Grams
4. Each row is hashed (SHA-256) and stored in `import_hash` column for deduplication
5. Composite key for matching: Date + Time + Party Name
6. Auto-calculated fields: net_revenue, gst_amount, gross_revenue, city, sales_person, purity
7. TCS is set to null (blank) on import — must be entered manually
8. Duplicate rows (matching import_hash) are skipped
9. New rows are highlighted yellow using the `hardik_latest_import_ids` setting
10. Optional email notification is sent via Edge Function

### 11.2 Export (Both Hardik Coin and Client Orders)

**Formats:** .xlsx, .xls, .csv

User clicks the Export dropdown and selects a format. Data is generated client-side using SheetJS.

---

## 12. EMAIL NOTIFICATIONS (RESEND)

### 12.1 How It Works

When orders are imported on the Hardik Coin page, an email notification can be sent to configured recipients. This uses a Supabase Edge Function that calls the Resend API.

### 12.2 Setting Up Resend

1. Go to https://resend.com and create an account
2. Go to **API Keys** and create a new API key
3. Note the API key (starts with `re_`)

### 12.3 Configuring Edge Function Secrets in Supabase

1. Go to **Supabase Dashboard**
2. Click **Edge Functions** in the left sidebar
3. Click on the `notify-new-orders` function
4. Click **Manage secrets** (or go to Settings > Edge Functions > Secrets)
5. Add these secrets:

| Secret Name              | Value                                        |
|--------------------------|----------------------------------------------|
| `RESEND_API_KEY`         | Your Resend API key (e.g. `re_abc123...`)    |
| `ORDER_NOTIFY_FROM`      | Sender email (e.g. `SafeGold <noreply@yourdomain.com>`) |
| `ORDER_NOTIFY_RECIPIENT` | Default recipient email (optional fallback)  |

Note: `SUPABASE_URL` and `SUPABASE_ANON_KEY` are automatically available to Edge Functions.

### 12.4 Configuring Email Recipients in the App

1. Log in as admin
2. Go to **Settings** page
3. In the "Email Notifications" section (admin-only), add or remove email addresses
4. These are stored in `app_settings` under the key `notification_emails`
5. When an import happens, all configured emails receive a notification

### 12.5 Deploying the Edge Function

If you need to redeploy or update the Edge Function:

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref wmvgvwqvmukbclemxrif

# Deploy the function
supabase functions deploy notify-new-orders
```

---

## 13. AUTHENTICATION & ACCESS CONTROL ARCHITECTURE

### 13.1 Authentication Flow

1. User enters email + password on Login page
2. `supabase.auth.signInWithPassword()` authenticates against Supabase Auth
3. App fetches user profile from the `profiles` table
4. If no profile row exists (first login), one is auto-created with role = 'user'
5. If `is_active` is false, login is blocked with error message
6. Auth tokens are stored in **sessionStorage** (cleared when browser tab closes)
7. Permissions are fetched, sidebar is populated

### 13.2 Two Roles

| Role  | Capabilities                                                    |
|-------|-----------------------------------------------------------------|
| admin | Full access to all pages. Can manage users, roles, permissions. Can see Email Notification settings. |
| user  | Can only access pages explicitly granted by an admin. Can change own password. |

### 13.3 Frontend Access Control

| Component       | File               | Purpose                                      |
|-----------------|---------------------|----------------------------------------------|
| ProtectedRoute  | App.tsx             | Blocks unauthenticated users → redirect to /login |
| PageGuard       | App.tsx             | Checks page slug against user's permissions   |
| MainLayout      | MainLayout.tsx      | Sidebar only shows permitted pages            |
| AccessDenied    | AccessDenied.tsx    | Shown when user navigates to a restricted page |

### 13.4 Backend Access Control

- All tables enforce RLS policies (see Section 8)
- The `is_admin()` function is `SECURITY DEFINER` to avoid RLS recursion
- Permission changes are broadcast via Supabase Realtime so all open tabs update instantly

---

## 14. PAGES & FEATURES

### Dashboard (`/`)
- Checks for new imported orders since last visit
- Shows count and popup notification
- Auto-refreshes every 60 seconds

### Hardik Coin (`/hardik-coin`)
- Full 25-column trade sheet
- **Import:** Upload .xls/.xlsx/.csv → validates, deduplicates, inserts
- **Export:** Download as .xlsx, .xls, or .csv
- **Inline editing:** Click any editable cell to modify, changes saved to database
- **New Order form:** Manual entry with auto-calculations
- **Custom columns:** Add/rename/delete extra columns
- **Yellow highlighting:** Recently imported rows are highlighted
- **Context menu:** Right-click rows to delete or create purchase records

### Meghna - Client Orders (`/client-orders`)
- Read-only view of client_orders (sales side columns only — 13 columns)
- TCS is editable inline
- Export in multiple formats
- Search by party name, order number, or symbol

### Vault Inventory (`/vault`)
- CRUD for vault records
- Summary cards: Available, Reserved, Delivered gold totals
- Search by vault name

### Settings (`/settings`)
- **Change Password:** Available to ALL users
- **Email Notifications:** ADMIN ONLY. Add/remove notification email addresses.

### Admin Panel (`/admin`)
- User list with role, active status
- Permission matrix: checkbox grid (users × pages)
- Add User form (creates auth user + profile)
- Toggle Role: switch between admin/user
- Deactivate User: soft-disable via is_active = false

---

## 15. DEPLOYMENT

### 15.1 Automatic (GitHub Actions)

Every push to the `main` branch triggers automatic deployment:

1. GitHub Actions runs `.github/workflows/deploy-pages.yml`
2. Installs Node 20, runs `npm ci`, runs `npm run build`
3. Uploads the `dist/` folder to GitHub Pages
4. Site is live at https://adityagupta-creator.github.io/vault-dashboard/

### 15.2 Manual Deployment

```bash
npm run build
# Then upload the dist/ folder to any static host
```

### 15.3 Vite Base Path

In `vite.config.ts`, production builds use `/vault-dashboard/` as the base path (matching the GitHub Pages URL). Development uses `/`.

```typescript
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/vault-dashboard/' : '/',
  plugins: [react()],
}))
```

If deploying to a different host (e.g. Vercel, Netlify), change the base to `/`.

### 15.4 SPA Routing on GitHub Pages

GitHub Pages doesn't natively support SPA routing. The `public/404.html` file handles this by saving the requested path to `sessionStorage` and redirecting to the root. The `index.html` then restores the path for React Router.

---

## 16. HOW-TO GUIDES FOR COMMON CHANGES

### 16.1 Add a New Page/Module

1. Create `src/pages/NewPage.tsx`
2. Add route in `src/App.tsx`:
   ```tsx
   <Route path="new-page" element={<PageGuard slug="new-page"><NewPage /></PageGuard>} />
   ```
3. Add sidebar entry in `src/layouts/MainLayout.tsx` in the `allNavigation` array:
   ```typescript
   { name: 'New Page', href: '/new-page', slug: 'new-page', icon: SomeIcon },
   ```
4. Insert into database (SQL Editor):
   ```sql
   INSERT INTO app_pages (slug, page_name, display_order)
   VALUES ('new-page', 'New Page', 7);
   ```
5. Grant access to admins:
   ```sql
   INSERT INTO user_page_permissions (user_id, page_id)
   SELECT p.id, ap.id FROM profiles p, app_pages ap
   WHERE p.role = 'admin' AND ap.slug = 'new-page'
   ON CONFLICT DO NOTHING;
   ```

### 16.2 Add a New Database Table

1. Create the table in **Supabase SQL Editor**
2. Enable RLS: `ALTER TABLE your_table ENABLE ROW LEVEL SECURITY;`
3. Create policies (at minimum a SELECT policy for authenticated users)
4. Enable Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE your_table;`
5. Add TypeScript interface in `src/types/index.ts`
6. Use in your page: `const [data, loading] = useRealtimeTable<YourType>('your_table')`

### 16.3 Add a New City Code

Edit `src/lib/hardikUtils.ts`:

1. Add to `CITY_CODE_TO_NAME`:
   ```typescript
   NEW_CODE: 'New City Name',
   ```
2. Add to `CITY_NAME_TO_SALESPERSON`:
   ```typescript
   'New City Name': 'Salesperson Name',
   ```

### 16.4 Change Calculation Formulas

Edit `src/lib/hardikCalculations.ts`:
- `recalcSales()` — sales side (net revenue, GST, gross revenue)
- `recalcPurchase()` — purchase side (net purchase, GST2, gross purchase)
- `calcMargin()` — trade margin and margin percentage

Also update `src/lib/sheetImport.ts` if the formulas affect how imported data is processed (the `buildOrderPayloads` function).

### 16.5 Add a New App Setting

1. Insert in SQL Editor:
   ```sql
   INSERT INTO app_settings (key, value)
   VALUES ('your_new_key', '"default_value"'::jsonb)
   ON CONFLICT DO NOTHING;
   ```
2. Create a hook in `src/hooks/useAppSettings.ts`:
   ```typescript
   export function useYourSetting() {
     return useSetting<string>('your_new_key', 'default_value')
   }
   ```
3. Use in your component:
   ```typescript
   const [value, setValue, loading] = useYourSetting()
   ```

### 16.6 Migrate to a Different Supabase Project

1. In the old project: export all table data (Supabase Dashboard > Table Editor > Export)
2. Create a new Supabase project at https://supabase.com
3. Run all SQL scripts from Section 9 in the new project's SQL Editor
4. Import the exported data
5. Update `src/api/supabase.ts` with the new project URL and anon key
6. Set up Edge Function secrets in the new project (Section 12.3)
7. Deploy the Edge Function to the new project (Section 12.5)
8. Disable "Confirm email" (Section 5.3)
9. Enable Realtime for all tables (Section 5.3)
10. Redeploy the frontend

### 16.7 Change the Supabase URL or Anon Key

Edit `src/api/supabase.ts` — the URL and key are hardcoded there:

```typescript
export const SUPABASE_URL = 'https://your-new-project.supabase.co'
export const SUPABASE_ANON_KEY = 'your-new-anon-key'
```

Then rebuild and redeploy.

---

## 17. ENVIRONMENT VARIABLES

| Variable                               | Where Used             | Purpose                              |
|----------------------------------------|------------------------|--------------------------------------|
| `import.meta.env.BASE_URL`            | App.tsx (BrowserRouter)| Router base path (set by Vite)       |
| `import.meta.env.VITE_ORDER_NOTIFY_FUNCTION` | HardikCoin.tsx  | Edge Function name override          |
| `VITE_MEGHNA_EMAIL`                   | GitHub Actions build   | Passed during build (currently unused)|
| `RESEND_API_KEY`                       | Edge Function secrets  | For sending emails via Resend        |
| `ORDER_NOTIFY_FROM`                    | Edge Function secrets  | Sender email address                 |
| `ORDER_NOTIFY_RECIPIENT`              | Edge Function secrets  | Default notification recipient       |

---

## 18. KEY ARCHITECTURAL DECISIONS

| Decision                                    | Rationale                                                    |
|---------------------------------------------|--------------------------------------------------------------|
| sessionStorage (not localStorage)           | Auth tokens clear when tab closes — more secure for financial data |
| Zustand (not Redux or Context)              | Minimal boilerplate, excellent TypeScript support, built-in persist middleware |
| SECURITY DEFINER function for is_admin()    | Prevents infinite recursion when RLS policies on profiles need to check user role |
| Batched app_settings fetch                  | Reduces 3-4 separate Supabase queries to 1, cutting page load time |
| SHA-256 import_hash                         | Prevents duplicate imports when the same file is uploaded twice |
| Realtime + polling fallback                 | Realtime for instant updates; 30-second polling as insurance against dropped WebSocket connections |
| PageGuard renders children hidden while permissions load | Data hooks start fetching immediately, avoiding sequential loading delays |
| All rates stored per gram                   | Consistent convention — avoids confusion between per-gram and per-10g pricing |

---

## 19. TROUBLESHOOTING

| Problem                                     | Solution                                                      |
|---------------------------------------------|---------------------------------------------------------------|
| Login shows "Email not confirmed"           | Disable "Confirm email" in Supabase > Authentication > Providers > Email |
| Sidebar is empty after login                | Check that the user has page permissions in user_page_permissions table |
| "Infinite recursion in policy for profiles" | The `is_admin()` function is missing. Run Script 3 from Section 9 |
| Import shows "Invalid format"               | File must have Date/Time, Party Name/Name/Firm, and Quantity/Grams columns |
| TCS shows ₹0.00 instead of blank           | TCS should be null in the database. Update: `UPDATE client_orders SET tcs_amount = NULL WHERE tcs_amount = 0` |
| Trade status shows "pending_supplier_booking"| Run Script 5 from Section 9 to migrate old status values      |
| Page loads forever (10+ seconds)            | Check Supabase Realtime is enabled. Check network. Timeout is 5 seconds. |
| "Cannot coerce result to single JSON object"| The `.single()` call found 0 or 2+ rows. Code uses `.maybeSingle()` to handle this. |
| Wrong person is admin                       | Use SQL Editor: `SELECT id, email, role FROM profiles;` then update the correct row |

---

*Last updated: March 2026*
