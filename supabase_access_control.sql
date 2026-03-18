-- ============================================================
-- Admin Access Control System - Database Migration
-- Run this ENTIRE script in Supabase SQL Editor
-- ============================================================

-- 0. Fix: Create a SECURITY DEFINER function to check admin role
--    This avoids infinite recursion in RLS policies on profiles
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

-- 1. Update profiles role column to admin/user
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

UPDATE profiles SET role = 'user' WHERE role NOT IN ('admin', 'user');

ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'user'));

-- 2. Fix profiles RLS policies (drop old ones, create safe ones)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Admin can update profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Enable read access for all users" ON profiles;
DROP POLICY IF EXISTS "Admin can manage profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Everyone can read their own profile; admins can read all
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (
    id = auth.uid() OR public.is_admin()
  );

-- Users can update their own non-role fields; admins can update anyone
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING (
    id = auth.uid() OR public.is_admin()
  );

-- Allow inserts (for new user signup trigger)
CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT WITH CHECK (true);

-- 3. Create app_pages table
CREATE TABLE IF NOT EXISTS app_pages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  page_name text NOT NULL,
  display_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

INSERT INTO app_pages (slug, page_name, display_order) VALUES
  ('dashboard',     'Dashboard',               1),
  ('hardik-coin',   'Hardik Coin',             2),
  ('client-orders', 'Meghna - Client Orders',  3),
  ('vault',         'Vault Inventory',         4),
  ('settings',      'Settings',                5),
  ('admin',         'Admin Panel',             6)
ON CONFLICT (slug) DO NOTHING;

-- 4. Create user_page_permissions table
CREATE TABLE IF NOT EXISTS user_page_permissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  page_id uuid NOT NULL REFERENCES app_pages(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, page_id)
);

-- 5. app_pages RLS: everyone can read
ALTER TABLE app_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read pages" ON app_pages;
DROP POLICY IF EXISTS "Admin can manage pages" ON app_pages;

CREATE POLICY "app_pages_select" ON app_pages
  FOR SELECT USING (true);

CREATE POLICY "app_pages_admin" ON app_pages
  FOR ALL USING (public.is_admin());

-- 6. user_page_permissions RLS
ALTER TABLE user_page_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own permissions" ON user_page_permissions;
DROP POLICY IF EXISTS "Admin can manage permissions" ON user_page_permissions;

CREATE POLICY "perms_select" ON user_page_permissions
  FOR SELECT USING (
    user_id = auth.uid() OR public.is_admin()
  );

CREATE POLICY "perms_admin_insert" ON user_page_permissions
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "perms_admin_update" ON user_page_permissions
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "perms_admin_delete" ON user_page_permissions
  FOR DELETE USING (public.is_admin());

-- 7. Enable realtime for permission changes
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE user_page_permissions;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ============================================================
-- AFTER running this script, set yourself as admin:
--
--   UPDATE profiles SET role = 'admin' WHERE email = 'YOUR_EMAIL';
--
-- Then grant yourself all page access:
--
--   INSERT INTO user_page_permissions (user_id, page_id)
--   SELECT p.id, ap.id
--   FROM profiles p CROSS JOIN app_pages ap
--   WHERE p.email = 'YOUR_EMAIL'
--   ON CONFLICT (user_id, page_id) DO NOTHING;
-- ============================================================
