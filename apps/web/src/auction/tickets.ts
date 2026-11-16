export type TicketState = "available" | "held" | "attached" | "spent" | "released"

export type PoolTicket = {
  id: string
  kind: "inner" | "outer"
  state: TicketState
  heldAt: number | null
}

export const HOLD_MS = 10 * 60 * 1000

function releaseStale(tickets: PoolTicket[], now: number) {
  return tickets.map((ticket) => {
    if (
      ticket.kind === "outer" &&
      ticket.state === "held" &&
      ticket.heldAt !== null &&
      now - ticket.heldAt >= HOLD_MS
    ) {
      return { ...ticket, state: "available" as const, heldAt: null }
    }
    return ticket
  })
}

export function holdOuterTicket(tickets: PoolTicket[], now: number) {
  const pool = releaseStale(tickets, now)
  const next = pool.find((ticket) => ticket.kind === "outer" && ticket.state === "available")
  if (!next) throw new Error("No outer ticket is available.")
  return {
    heldId: next.id,
    tickets: pool.map((ticket) =>
      ticket.id === next.id ? { ...ticket, state: "held" as const, heldAt: now } : ticket,
    ),
  }
}

export function releaseHold(tickets: PoolTicket[], ticketId: string) {
  const ticket = tickets.find((item) => item.id === ticketId)
  if (!ticket || ticket.kind !== "outer" || ticket.state !== "held") {
    throw new Error("That ticket is not a hold.")
  }
  return tickets.map((item) =>
    item.id === ticketId ? { ...item, state: "available" as const, heldAt: null } : item,
  )
}

export const OUTER_POOL_CAP = 16

export function planSetupSequences(accountSequence: number, needsTrust: boolean, outerCount: number) {
  if (!Number.isInteger(accountSequence) || accountSequence < 1) {
    throw new Error("The account sequence is missing.")
  }
  if (!Number.isInteger(outerCount) || outerCount < 1 || outerCount > OUTER_POOL_CAP) {
    throw new Error("The outer ticket pool must be from 1 to 16.")
  }
  let sequence = accountSequence
  const trustSequence = needsTrust ? sequence++ : null
  const ticketCreateSequence = sequence
  const ticketCount = 1 + outerCount
  const innerTicket = ticketCreateSequence + 1
  const outerTickets = Array.from({ length: outerCount }, (_, index) => innerTicket + 1 + index)
  const issuanceSequence = ticketCreateSequence + ticketCount + 1
  const ticketSequences = new Set([innerTicket, ...outerTickets])
  if (ticketSequences.has(issuanceSequence) || issuanceSequence === ticketCreateSequence) {
    throw new Error("The MPT create sequence collides with a ticket.")
  }
  return {
    trustSequence,
    ticketCreateSequence,
    ticketCount,
    innerTicket,
    outerTickets,
    issuanceSequence,
  }
}
