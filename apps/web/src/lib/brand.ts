export const PLATFORM_NAME = "Antecipa"

export function initials(name: string): string {
  const parts = name
    .replace(/\b(ltda\.?|s\.?a\.?|eireli|me)\b/gi, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 1 && !/^(da|de|do|dos|das|e)$/i.test(part))
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}
