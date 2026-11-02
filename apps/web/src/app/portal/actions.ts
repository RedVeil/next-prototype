"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { portalCookie } from "./session"
import { loadPortalUsers, type PortalRole } from "./users"

function isRole(value: unknown): value is PortalRole {
  return value === "investor" || value === "seller"
}

export async function loginAs(formData: FormData) {
  const role = formData.get("role")
  if (!isRole(role)) redirect("/")

  const id = formData.get("identity_id")
  const users = await loadPortalUsers(role)
  if (typeof id !== "string" || !users.some((user) => user.id === id)) {
    redirect(`/${role}?error=1`)
  }

  const store = await cookies()
  store.set(portalCookie(role), id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  })
  revalidatePath(`/${role}`)
  redirect(`/${role}`)
}

export async function logoutPortal(formData: FormData) {
  const role = formData.get("role")
  if (!isRole(role)) redirect("/")
  const store = await cookies()
  store.delete(portalCookie(role))
  revalidatePath(`/${role}`)
  redirect(`/${role}`)
}
