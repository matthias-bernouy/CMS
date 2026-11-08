import type { ContentRepository } from "content/application/interfaces/ContentRepository";
import type { ContentDelivery } from "content/pages/delivery/ContentDelivery";
import type { ContentDeliveryHost } from "content/exports/runtime/public-delivery";
import type { ContentCapabilityContext } from "content/application/interfaces/ContentCapabilityContext";
import type { ContentContributions } from "content/application/interfaces/ContentContributions";
export interface ContentServices {
    readonly repo: ContentRepository;
    readonly contributions: ContentContributions;
    readonly publicDelivery: (context: ContentCapabilityContext) => Pick<ContentDelivery, "resolvePath">;
    readonly contentQuery?: (
        context: ContentCapabilityContext,
        contractId: string,
        capabilityId: string,
        input: Parameters<NonNullable<ContentDeliveryHost["executeQuery"]>>[2],
    ) => Promise<Response>;
}
