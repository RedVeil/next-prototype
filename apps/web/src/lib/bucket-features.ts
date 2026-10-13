import type { SupabaseClient } from "@supabase/supabase-js"
import type { FeatureChoice } from "@/app/portal/market-query"

export type BucketFeatureLink = {
  bucketId: string
  featureId: string
  mode: "yes" | "no"
}

export async function loadBucketFeatureLinks(supabase: SupabaseClient): Promise<BucketFeatureLink[]> {
  const withMode = await supabase.from("organisation_bucket_features").select("bucket_id, feature_id, mode")
  if (!withMode.error) {
    return (withMode.data ?? []).map((row) => ({
      bucketId: row.bucket_id as string,
      featureId: row.feature_id as string,
      mode: row.mode === "no" ? "no" : "yes",
    }))
  }
  if (!withMode.error.message.toLowerCase().includes("mode")) throw new Error(withMode.error.message)
  const plain = await supabase.from("organisation_bucket_features").select("bucket_id, feature_id")
  if (plain.error) throw new Error(plain.error.message)
  return (plain.data ?? []).map((row) => ({
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
