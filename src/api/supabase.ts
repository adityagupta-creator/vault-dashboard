import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://wmvgvwqvmukbclemxrif.supabase.co'
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indtdmd2d3F2bXVrYmNsZW14cmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyOTg2MDksImV4cCI6MjA4ODg3NDYwOX0.rMltFsh8v5g9d25Us6rA6TgSzd8tWag4tXCVtQwcMTA'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
