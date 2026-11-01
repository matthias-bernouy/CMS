import { parseResourceMetadata } from "@bernouy/cms-gateway/protocol";
import { type ProviderBinaryResult, type ProviderCapabilityRegistry } from "../../../dispatch/registry";
import type { CmsContentDependencies } from "../../../ports";

export function registerContentDeliveryCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    dependencies: CmsContentDependencies,
): void {
    dispatcher.register(
        "ulvia.cms.content",
        "delivery.resolve-path",
        async (input, context): Promise<ProviderBinaryResult> => {
            const { response, cacheMetadata } = await resolveDelivery(input, context, dependencies, true);
            const permitted = new Set([
                "content-type",
                "content-length",
                "content-language",
                "content-range",
                "accept-ranges",
                "content-disposition",
                "etag",
                "last-modified",
                "expires",
                "vary",
                "link",
                "location",
                "cache-control",
                "retry-after",
                "x-robots-tag",
            ]);
            const resource = parseResourceMetadata({
                ...(cacheMetadata
                    ? {
                          vary: [
                              ...new Set([
                                  "accept",
                                  "accept-language",
                                  ...(response.headers.get("vary") ?? "")
                                      .split(",")
                                      .map((value) => value.trim().toLowerCase())
                                      .filter(Boolean),
                              ]),
                          ],
                          cacheTags: deliveryCacheTags(response),
                      }
                    : {}),
                status: response.status,
                headers: Object.fromEntries([...response.headers].filter(([name]) => permitted.has(name))),
            });
            const empty = !response.body;
            return {
                kind: "binary",
                stream:
                    response.body ??
                    new ReadableStream({
                        start(controller) {
                            controller.close();
                        },
                    }),
                contentType: "application/octet-stream",
                ...(empty ? { contentLength: 0 } : {}),
                resource,
            };
        },
    );
    dispatcher.register("ulvia.cms.content", "delivery.resolve-resource", async (input, context) => {
        const { response } = await resolveDelivery(input, context, dependencies, false);
        return resourceResponse(response, {
            vary: ["accept", "accept-language"],
            cacheTags: deliveryCacheTags(response),
        });
    });
}

import { resolveDelivery, deliveryCacheTags } from "./resolve";
import { resourceResponse } from "@bernouy/cms-gateway/provider/server";
