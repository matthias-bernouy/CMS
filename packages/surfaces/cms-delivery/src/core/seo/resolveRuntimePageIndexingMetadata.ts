import type { TPage } from "@bernouy/cms-content";
import type DeliveryCms from "cms-delivery/DeliveryCms";
import { executeDeliverySourceGet } from "cms-delivery/core/sources/executeDeliverySourceGet";
import {
    resolvePageIndexingMetadata,
    type PageIndexingMetadataResult,
} from "cms-delivery/core/seo/resolvePageIndexingMetadata";

export function resolveRuntimePageIndexingMetadata(
    request: Request,
    page: TPage,
    delivery: DeliveryCms,
): Promise<PageIndexingMetadataResult> {
    return resolvePageIndexingMetadata(request, page, delivery.sources, (endpointUrn, inputParam, value) =>
        executeDeliverySourceGet(delivery, request, endpointUrn, { [inputParam]: value }),
    );
}
