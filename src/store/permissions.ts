import { create } from 'zustand'
import { supabase } from '../api/supabase'
import { useAuthStore } from './auth'
import type { AppPage } from '../types'

interface PermissionsState {
  allowedSlugs: Set<string>
  allPages: AppPage[]
  loading: boolean
  fetched: boolean
  fetchPermissions: () => Promise<void>
  hasAccess: (slug: string) => boolean
  reset: () => void
}

export const usePermissionsStore = create<PermissionsState>()((set, get) => ({
  allowedSlugs: new Set<string>(),
  allPages: [],
  loading: false,
  fetched: false,

  fetchPermissions: async () => {
    const user = useAuthStore.getState().user
    if (!user) {
      set({ allowedSlugs: new Set(), allPages: [], loading: false, fetched: true })
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
          allowedSlugs: new Set(allPages.map((p) => p.slug)),
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
      const allowedSlugs = new Set(
        allPages.filter((p) => allowedPageIds.has(p.id)).map((p) => p.slug)
      )

      set({ allowedSlugs, allPages, loading: false, fetched: true })
    } catch (err) {
      console.error('Failed to fetch permissions:', err)
      set({ loading: false, fetched: true })
    }
  },

  hasAccess: (slug: string) => {
    const { allowedSlugs } = get()
    const user = useAuthStore.getState().user
    if (!user) return false
    if (user.role === 'admin') return true
    return allowedSlugs.has(slug)
  },

  reset: () => set({ allowedSlugs: new Set(), allPages: [], loading: false, fetched: false }),
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
