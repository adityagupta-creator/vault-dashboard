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
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,
      setUser: (user) => set({ user }),
      setLoading: (isLoading) => set({ isLoading }),
      
      signIn: async (email: string, password: string) => {
        try {
          set({ isLoading: true })
          const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password })
          if (authError) throw authError
          if (!authData.user) throw new Error('No user returned')
          
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', authData.user.id)
            .single()
          if (profileError) throw profileError
          
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
    }),
    {
      name: 'safegold-auth',
      partialize: (state) => ({ user: state.user }),
    }
  )
)
