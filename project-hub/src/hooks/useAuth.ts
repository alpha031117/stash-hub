import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type AuthState = {
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  init: () => Promise<void>
}

export const useAuth = create<AuthState>((set) => ({
  session: null,
  loading: true,

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  },

  signUp: async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password })
    return { error }
  },

  signOut: async () => {
    await supabase.auth.signOut()
  },

  init: async () => {
    const { data } = await supabase.auth.getSession()
    set({ session: data.session, loading: false })
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session })
    })
  },
}))
