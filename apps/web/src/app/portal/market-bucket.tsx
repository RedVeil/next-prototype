"use client"

import { useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { BucketForm, Dialog, type BucketFormPreset } from "./bucket-form"

export type MarketBucketDraft = BucketFormPreset

export function CreateMarketBucket({
  draft,
  features,
}: {
  draft: MarketBucketDraft
  features: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const formKey = [
    draft.name,
    draft.riskLow,
    draft.riskHigh,
    draft.countries,
    draft.currencies,
    draft.industries,
    draft.featureChoices.map((choice) => `${choice.id}:${choice.mode}`).join(","),
  ].join("|")

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-10 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white"
      >
        Create Bucket
      </button>
      {open
        ? createPortal(
            <Dialog
              wide
              title="Create investment bucket"
              description="A bucket is a standing mandate. It draws from the same available RLUSD. Country and currency lists can be left blank to match any."
              onClose={() => setOpen(false)}
            >
              <BucketForm
                key={formKey}
                bucket={null}
                features={features}
                preset={draft}
                onSaved={() => {
                  setOpen(false)
                  router.refresh()
                }}
              />
            </Dialog>,
            document.body,
          )
        : null}
    </>
  )
}
