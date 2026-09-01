"use client"

import { useParams } from "next/navigation"
import Link from "next/link"
import { BucketEditor } from "@/components/investor/BucketEditor"
import { useStore } from "@/lib/store"

export default function EditBucketPage() {
  const params = useParams<{ id: string }>()
  const { getBucket } = useStore()
  const bucket = getBucket(params.id)

  if (!bucket) {
    return (
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Bucket not found</h1>
        <p className="mt-2 text-sm text-neutral-500">
          This investment bucket was deleted or does not exist.
        </p>
        <Link
          href="/investor/buckets"
          className="mt-4 inline-flex h-10 items-center text-sm font-medium text-neutral-900 underline-offset-2 hover:underline"
        >
          Back to buckets
        </Link>
      </div>
    )
  }

  return <BucketEditor key={bucket.id} mode="edit" bucket={bucket} />
}
