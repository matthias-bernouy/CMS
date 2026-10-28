import type { TPage } from "cms-content/pages/interfaces/pages";
import { resolvePageIndexingMetadata, type PageIndexingMetadataResult } from "@bernouy/cms-content/seo";
import type ContentDeliveryHost from "cms-content/pages/delivery/interfaces";

/** Preserve the existing indexing query path through a Provider-supplied invocation port. */
export function resolveRuntimePageIndexingMetadata(
    request: Request,
    page: TPage,
    delivery: ContentDeliveryHost,
): Promise<PageIndexingMetadataResult> {
    return resolvePageIndexingMetadata(
        request,
        page,
        (contractId, capabilityId, input) =>
            delivery.executeQuery?.(contractId, capabilityId, input) ??
            Promise.resolve(new Response(null, { status: 503 })),
    );
}
