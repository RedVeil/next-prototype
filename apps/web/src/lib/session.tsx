"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { getSession } from "./actions"
import type { SessionSnapshot } from "./records"

const empty: SessionSnapshot = {
  email: null,
  userId: null,
  role: null,
  company: null,
  investor: null,
  settings: { companyApplicationsAllowed: true, investorApplicationsAllowed: true },
}

const SessionContext = createContext<{
  session: SessionSnapshot
  loading: boolean
  refresh: () => Promise<void>
}>({ session: empty, loading: true, refresh: async () => undefined })

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionSnapshot>(empty)
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    const next = await getSession()
    setSession(next)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return <SessionContext.Provider value={{ session, loading, refresh }}>{children}</SessionContext.Provider>
}

export function useSession() {
  return useContext(SessionContext)
}
