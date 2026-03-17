-- app_settings: shared key-value config visible to all authenticated users.
-- Stores custom columns, row order, and latest import batch IDs centrally
-- so every user sees the same state.

CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT        PRIMARY KEY,
  value JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID   REFERENCES auth.users(id)
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read app_settings"
  ON app_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert app_settings"
  ON app_settings FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update app_settings"
  ON app_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Seed initial rows so upsert works immediately
INSERT INTO app_settings (key, value) VALUES
  ('hardik_custom_columns', '[]'::jsonb),
  ('hardik_row_order', '[]'::jsonb),
  ('hardik_latest_import_ids', '[]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Enable Supabase Realtime on all shared tables
ALTER PUBLICATION supabase_realtime ADD TABLE app_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE client_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE supplier_purchases;
ALTER PUBLICATION supabase_realtime ADD TABLE vault_logistics;
