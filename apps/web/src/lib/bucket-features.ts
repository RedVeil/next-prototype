import type { SupabaseClient } from "@supabase/supabase-js"
import type { FeatureChoice } from "@/app/portal/market-query"

export type BucketFeatureLink = {
  bucketId: string
  featureId: string
  mode: "yes" | "no"
}

export async function loadBucketFeatureLinks(
  supabase: SupabaseClient,
  bucketIds?: string[],
): Promise<BucketFeatureLink[]> {
  if (bucketIds && bucketIds.length === 0) return []
  let withMode = supabase.from("organisation_bucket_features").select("bucket_id, feature_id, mode")
  if (bucketIds) withMode = withMode.in("bucket_id", bucketIds)
  const withModeResult = await withMode
  if (!withModeResult.error) {
    return (withModeResult.data ?? []).map((row) => ({
      bucketId: row.bucket_id as string,
      featureId: row.feature_id as string,
      mode: row.mode === "no" ? "no" : "yes",
    }))
  }
  if (!withModeResult.error.message.toLowerCase().includes("mode")) throw new Error(withModeResult.error.message)
  let plain = supabase.from("organisation_bucket_features").select("bucket_id, feature_id")
  if (bucketIds) plain = plain.in("bucket_id", bucketIds)
  const plainResult = await plain
  if (plainResult.error) throw new Error(plainResult.error.message)
  return (plainResult.data ?? []).map((row) => ({
    bucketId: row.bucket_id as string,
    featureId: row.feature_id as string,
    mode: "yes",
  }))
}

export function featureChoicesByBucket(links: BucketFeatureLink[]) {
  const choices = new Map<string, FeatureChoice[]>()
  for (const link of links) {
    const list = choices.get(link.bucketId) ?? []
    list.push({ id: link.featureId, mode: link.mode })
    choices.set(link.bucketId, list)
  }
  return choices
}
