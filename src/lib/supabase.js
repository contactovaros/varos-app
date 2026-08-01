import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.warn(
    '[Varo\'s] Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en tu archivo .env — revisa el README.'
  )
}

export const supabase = createClient(url ?? '', anonKey ?? '')
