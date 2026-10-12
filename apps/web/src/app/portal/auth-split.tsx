import { loginAs } from "./actions"
import type { PortalRole, PortalUser } from "./users"

const field =
  "mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-foreground disabled:bg-background disabled:text-muted"
const label = "block text-sm"
const button =
  "rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-60"

function userLabel(user: PortalUser) {
  return user.organisation ? `${user.username} · ${user.organisation}` : user.username
}

export function AuthSplit({
  role,
  users,
  loginError,
}: {
  role: PortalRole
  users: PortalUser[]
  loginError?: boolean
}) {
  return (
    <main className="grid flex-1 md:grid-cols-2">
      <section className="flex min-h-[calc(50vh-1.75rem)] items-center justify-center border-b border-border px-8 py-16 md:min-h-[calc(100vh-3.5rem)] md:border-r md:border-b-0">
        <form action={loginAs} className="grid w-full max-w-sm gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>
            <p className="mt-2 text-sm text-muted">Choose a demo user for this portal.</p>
          </div>
          <input type="hidden" name="role" value={role} />
          <label className={label}>
            User
            <select
              name="identity_id"
              required={users.length > 0}
              disabled={users.length === 0}
              defaultValue={users[0]?.id ?? ""}
              className={field}
            >
              {users.length === 0 ? <option value="">No users</option> : null}
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {userLabel(user)}
                </option>
              ))}
            </select>
          </label>
          {loginError ? <p className="text-sm text-red-700">That user is not available for this portal.</p> : null}
          <button type="submit" disabled={users.length === 0} className={button}>
            Log in
          </button>
        </form>
      </section>
      <section className="flex min-h-[calc(50vh-1.75rem)] items-center justify-center px-8 py-16 md:min-h-[calc(100vh-3.5rem)]">
        <form className="grid w-full max-w-sm gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Sign up</h1>
            <p className="mt-2 text-sm text-muted">Signup is not available yet.</p>
          </div>
          <fieldset disabled className="grid gap-4">
            <label className={label}>
              Name
              <input name="name" className={field} />
            </label>
            <label className={label}>
              Email
              <input name="email" type="email" className={field} />
            </label>
            <label className={label}>
              Password
              <input name="password" type="password" className={field} />
            </label>
            <button type="submit" className={button}>
              Sign up
            </button>
          </fieldset>
        </form>
      </section>
    </main>
  )
}
