import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [customer, setCustomer] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  async function loadCustomer(userId, googleUser) {
    const { data } = await supabase.from('customers').select('*').eq('id', userId).single()

    // Si el cliente ya existía pero le falta la foto o el nombre (ej. se registró antes
    // con el login por correo), la completamos con los datos de su cuenta de Google.
    if (data && googleUser) {
      const googleAvatar = googleUser.user_metadata?.avatar_url || googleUser.user_metadata?.picture
      const googleName = googleUser.user_metadata?.full_name || googleUser.user_metadata?.name
      const faltaAvatar = !data.avatar_url && googleAvatar
      const faltaNombre = !data.full_name && googleName
      if (faltaAvatar || faltaNombre) {
        const patch = {}
        if (faltaAvatar) patch.avatar_url = googleAvatar
        if (faltaNombre) patch.full_name = googleName
        await supabase.from('customers').update(patch).eq('id', userId)
        setCustomer({ ...data, ...patch })
        return
      }
    }

    setCustomer(data ?? null)
  }

  async function loadAdminStatus(userId) {
    const { data } = await supabase.from('admins').select('user_id').eq('user_id', userId).maybeSingle()
    setIsAdmin(!!data)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) {
        loadCustomer(data.session.user.id, data.session.user)
        loadAdminStatus(data.session.user.id)
      }
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession) {
        loadCustomer(newSession.user.id, newSession.user)
        loadAdminStatus(newSession.user.id)
      } else {
        setCustomer(null)
        setIsAdmin(false)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // redirectPath: a dónde volver después de iniciar sesión con Google
  // (por ejemplo "/checkin" cuando el cliente escaneó el QR del local)
  async function signInWithGoogle(redirectPath = '/') {
    return supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${redirectPath}` }
    })
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function completeProfile({ full_name, birthday }) {
    if (!session) return
    await supabase.from('customers').update({ full_name, birthday }).eq('id', session.user.id)
    await loadCustomer(session.user.id)
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        customer,
        isAdmin,
        loading,
        signInWithGoogle,
        signOut,
        completeProfile,
        refreshCustomer: () => session && loadCustomer(session.user.id, session.user)
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
