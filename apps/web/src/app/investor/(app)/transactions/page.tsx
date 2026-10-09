import { redirect } from "next/navigation"

export default function TransactionsPage() {
  redirect("/investor/dashboard?tab=history")
}