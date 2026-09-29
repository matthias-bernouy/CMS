import type { TPage } from "@bernouy/cms-content/rendering";
import type DeliveryCms from "cms-delivery/DeliveryCms";
import { executeIndexingCapability } from "cms-delivery/core/seo/indexing/executeIndexingCapability";
import {
    resolvePageIndexingMetadata,
    type PageIndexingMetadataResult,
} from "cms-delivery/core/seo/indexing/resolvePageIndexingMetadata";

export function resolveRuntimePageIndexingMetadata(
    request: Request,
    page: TPage,
    delivery: DeliveryCms,
): Promise<PageIndexingMetadataResult> {
    return resolvePageIndexingMetadata(request, page, (contractId, capabilityId, input) =>
        executeIndexingCapability(delivery, request, contractId, capabilityId, input),
    );
}
