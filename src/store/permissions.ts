import { create } from 'zustand'
import { supabase } from '../api/supabase'
import { useAuthStore } from './auth'
import type { AppPage } from '../types'

interface PermissionsState {
  allowedSlugs: string[]
  allPages: AppPage[]
  loading: boolean
  fetched: boolean
  fetchPermissions: () => Promise<void>
  reset: () => void
}

export const usePermissionsStore = create<PermissionsState>()((set) => ({
  allowedSlugs: [],
  allPages: [],
  loading: false,
  fetched: false,

  fetchPermissions: async () => {
    const user = useAuthStore.getState().user
    if (!user) {
      set({ allowedSlugs: [], allPages: [], loading: false, fetched: true })
      return
    }

    set({ loading: true })
    try {
      const { data: pages } = await supabase
        .from('app_pages')
        .select('*')
        .order('display_order')

      const allPages = (pages ?? []) as AppPage[]

      if (user.role === 'admin') {
        set({
          allowedSlugs: allPages.map((p) => p.slug),
          allPages,
          loading: false,
          fetched: true,
        })
        return
      }

      const { data: perms } = await supabase
        .from('user_page_permissions')
        .select('page_id')
        .eq('user_id', user.id)

      const allowedPageIds = new Set((perms ?? []).map((p: { page_id: string }) => p.page_id))
      const allowedSlugs = allPages.filter((p) => allowedPageIds.has(p.id)).map((p) => p.slug)

      set({ allowedSlugs, allPages, loading: false, fetched: true })
    } catch (err) {
      console.error('Failed to fetch permissions:', err)
      set({ loading: false, fetched: true })
    }
  },

  reset: () => set({ allowedSlugs: [], allPages: [], loading: false, fetched: false }),
}))

let realtimeSub: ReturnType<typeof supabase.channel> | null = null

export function subscribeToPermissionChanges() {
  if (realtimeSub) realtimeSub.unsubscribe()

  realtimeSub = supabase
    .channel('permission-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'user_page_permissions' },
      () => {
        usePermissionsStore.getState().fetchPermissions()
      }
    )
    .subscribe()

  return () => {
    realtimeSub?.unsubscribe()
    realtimeSub = null
  }
}
