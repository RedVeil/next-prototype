import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { TopNav } from "./nav"
import { loadNavProfile } from "./portal/nav-profile"
import { Sidebar } from "./sidebar"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Antecipa",
  description: "Database connection",
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const profile = await loadNavProfile()

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <TopNav profile={profile} />
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </div>
      </body>
    </html>
  )
}
