import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/AuthProvider'

export interface Profile {
  id: string
  display_name: string
  created_at: string
}

export function useProfile() {
  const { session } = useAuth()
  const uid = session?.user.id
  return useQuery({
    queryKey: ['profile', uid],
    enabled: !!uid,
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid!)
        .maybeSingle()
      if (error) throw error
      return data as Profile | null
    },
  })
}
