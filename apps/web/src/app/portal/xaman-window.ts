type SignWindowListener = (result: { url: string; opened: boolean }) => void

const listeners = new Set<SignWindowListener>()

export function subscribeSignWindow(listener: SignWindowListener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// XamanAdapter skips its own popup when onQRCode is set, so this opens that window.
export function openXamanSignWindow(url: string) {
  const left = window.screen.width / 2 - 250
  const top = window.screen.height / 2 - 300
  const popup = window.open(
    url,
    "Xaman Sign",
    `width=500,height=600,left=${left},top=${top},resizable=yes,scrollbars=yes`,
  )
  const opened = popup !== null
  for (const listener of listeners) listener({ url, opened })
}
