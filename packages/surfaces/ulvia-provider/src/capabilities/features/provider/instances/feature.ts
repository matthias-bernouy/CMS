import { defineCapability, defineFeature, z } from "@bernouy/ulvia-sdk";
import {
    cmsInstanceSchema,
    cmsInstancePageSchema,
    listCmsInstancesInputSchema,
    unavailableInstanceSchema,
} from "./schemas";

const listInstances = defineCapability({
    id: "list",
    description: "List a bounded page of CMS instances visible to the authenticated provider account.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    input: listCmsInstancesInputSchema,
    output: cmsInstancePageSchema,
    errors: {},
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path: "/v1/cms-instances",
            input: { query: { cursor: "cursor", limit: "limit" } },
            response: { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: {} },
        },
    ],
    docs: ["overview.md"],
});
const getCurrentInstance = defineCapability({
    id: "get-current",
    description:
        "Return the CMS instance selected by the authenticated provider context without accepting a caller-supplied instance identifier.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    input: z.strictObject({}),
    output: cmsInstanceSchema,
    errors: { INSTANCE_UNAVAILABLE: { retryable: true, output: unavailableInstanceSchema } },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path: "/v1/cms-instances/current",
            input: {},
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INSTANCE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["overview.md"],
});

/** Published protocol template only; the official Provider has no account-scoped discovery implementation. */
export const providerCmsInstancesFeature = defineFeature({
    contractId: "ulvia/provider.cms-instances",
    name: "CMS instance discovery",
    description:
        "Discover the CMS instances visible to the authenticated provider account. Instance lifecycle, routing, credentials and deployment records remain private to the provider.",
    version: "1.0.0",
    publisherId: "ulvia",
    catalogue: { icon: "server", categories: ["administration", "infrastructure"] },
    documents: new URL("../../../../../docs/provider/instances/", import.meta.url),
    capabilities: [getCurrentInstance, listInstances],
});
