import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { destinationPath } from "@/lib/auth-destination"

export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const code = request.nextUrl.searchParams.get("code")
  const failed = new URL("/", request.url)
  failed.searchParams.set("auth", "failed")
  if (!url || !key || !code) return NextResponse.redirect(failed)

  const sessionCookies: { name: string; value: string; options: Record<string, unknown> }[] = []
  const cacheHeaders: Record<string, string> = {}
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        sessionCookies.splice(0, sessionCookies.length, ...cookiesToSet)
        Object.assign(cacheHeaders, headers)
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
      },
    },
  })

  const exchanged = await supabase.auth.exchangeCodeForSession(code)
  if (exchanged.error || !exchanged.data.user) return NextResponse.redirect(failed)

  const destination = request.nextUrl.clone()
  destination.pathname = await destinationPath(supabase, exchanged.data.user.id)
  destination.search = ""
  const response = NextResponse.redirect(destination)
  for (const { name, value, options } of sessionCookies) {
    response.cookies.set(name, value, options)
  }
  for (const [name, value] of Object.entries(cacheHeaders)) response.headers.set(name, value)
  return response
}
