import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../api/supabase'
import type { Profile, UserRole } from '../types'

interface AuthState {
  user: Profile | null
  isLoading: boolean
  setUser: (user: Profile | null) => void
  setLoading: (loading: boolean) => void
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  signOut: () => Promise<void>
  hasRole: (roles: UserRole[]) => boolean
  isAdmin: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: true,
      setUser: (user) => set({ user }),
      setLoading: (isLoading) => set({ isLoading }),
      
      signIn: async (email: string, password: string) => {
        try {
          set({ isLoading: true })
          const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password })
          if (authError) throw authError
          if (!authData.user) throw new Error('No user returned')
          
          let { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', authData.user.id)
            .maybeSingle()

          if (!profile) {
            const { data: created } = await supabase.from('profiles').upsert({
              id: authData.user.id,
              email: authData.user.email,
              full_name: authData.user.user_metadata?.full_name || authData.user.email?.split('@')[0] || '',
              role: 'user',
              is_active: true,
            }).select('*').single()
            profile = created
          }

          if (!profile) throw new Error('Failed to load profile')

          if (!(profile as Profile).is_active) {
            await supabase.auth.signOut()
            throw new Error('Your account has been deactivated. Contact your administrator.')
          }
          
          set({ user: profile as Profile, isLoading: false })
          return { success: true }
        } catch (error) {
          set({ isLoading: false })
          return { success: false, error: (error as Error).message }
        }
      },
      
      signOut: async () => {
        await supabase.auth.signOut()
        set({ user: null })
      },
      
      hasRole: (roles: UserRole[]) => {
        const { user } = get()
        return user ? roles.includes(user.role) : false
      },

      isAdmin: () => {
        const { user } = get()
        return user?.role === 'admin'
      },
    }),
    {
      name: 'safegold-auth',
      partialize: (state) => ({ user: state.user }),
      onRehydrateStorage: () => (state) => {
        if (state?.user) {
          state.isLoading = false
        }
      },
    }
  )
)
