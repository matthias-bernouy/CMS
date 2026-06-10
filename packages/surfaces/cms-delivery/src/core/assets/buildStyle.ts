import type { DeliveryRepository } from "cms-delivery/interfaces/DeliveryRepository";
import type { CacheEntry } from "@bernouy/http-runner";
import { compress } from "@bernouy/http-runner";

/**
 * Build the theme stylesheet entry served at `<cmsPathPrefix>/style`. For
 * now it's simply the raw CSS configured in `site.theme`; any future
 * augmentation (runtime tokens, inlined critical CSS, etc.) belongs here
 * rather than in the endpoint handler.
 */
export async function generateStyleEntry(repository: DeliveryRepository): Promise<CacheEntry> {
    const settings = await repository.getSystem();
    return compress(settings.site?.theme || "", "text/css");
}
