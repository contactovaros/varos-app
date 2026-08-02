import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [customer, setCustomer] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  async function loadCustomer(userId) {
    const { data } = await supabase.from('customers').select('*').eq('id', userId).single()
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
        loadCustomer(data.session.user.id)
        loadAdminStatus(data.session.user.id)
      }
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession) {
        loadCustomer(newSession.user.id)
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
        refreshCustomer: () => session && loadCustomer(session.user.id)
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
