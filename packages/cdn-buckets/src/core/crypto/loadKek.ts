import { loadKek as coreLoadKek } from "@bernouy/core";

/**
 * Load the cdn-buckets KEK from `process.env.CDN_BUCKETS_KEK`.
 *
 * Thin wrapper over `@bernouy/core`'s generic `loadKek` that fixes the
 * env var name in error messages — keeps `loadKek(process.env.CDN_BUCKETS_KEK)`
 * call sites readable while sharing the parsing logic with other
 * services (e.g. cms-control-mt's `CMS_KEK`).
 */
export function loadKek(envValue: string | undefined): Buffer {
    return coreLoadKek(envValue, "CDN_BUCKETS_KEK");
}
