-- ============================================================
-- Admin Access Control System - Database Migration
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Add 'role' column to profiles if it doesn't support admin/user
--    (The existing role column uses old values; we update them)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

UPDATE profiles SET role = 'admin' WHERE role IN ('management');
UPDATE profiles SET role = 'user' WHERE role NOT IN ('admin', 'user');

ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'user'));

-- 2. Create app_pages table
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

-- 3. Create user_page_permissions table
CREATE TABLE IF NOT EXISTS user_page_permissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  page_id uuid NOT NULL REFERENCES app_pages(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, page_id)
);

-- 4. Row Level Security

-- app_pages: everyone can read, only admin can write
ALTER TABLE app_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read pages" ON app_pages;
CREATE POLICY "Anyone can read pages" ON app_pages
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin can manage pages" ON app_pages;
CREATE POLICY "Admin can manage pages" ON app_pages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- user_page_permissions: users see their own, admin sees all
ALTER TABLE user_page_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own permissions" ON user_page_permissions;
CREATE POLICY "Users can read own permissions" ON user_page_permissions
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admin can manage permissions" ON user_page_permissions;
CREATE POLICY "Admin can manage permissions" ON user_page_permissions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- profiles: users see their own, admin sees all, admin can update
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile" ON profiles
  FOR SELECT USING (
    id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admin can update profiles" ON profiles;
CREATE POLICY "Admin can update profiles" ON profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 5. Grant admin users all page permissions automatically
--    (Run this once, or whenever you add a new admin)
INSERT INTO user_page_permissions (user_id, page_id)
SELECT p.id, ap.id
FROM profiles p
CROSS JOIN app_pages ap
WHERE p.role = 'admin'
ON CONFLICT (user_id, page_id) DO NOTHING;

-- 6. Enable realtime for permission changes
ALTER PUBLICATION supabase_realtime ADD TABLE user_page_permissions;
