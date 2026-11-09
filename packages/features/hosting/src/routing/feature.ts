import { capabilitiesFor, contractString, defineFeature, z } from "@bernouy/ulvia-sdk";
import { HostingError } from "hosting/core/errors";
import type { RoutingServices } from "hosting/interfaces/routing";
import { ROUTING_CONTRACT_ID, ROUTING_INSTANCE_ID, EDGE_ROUTING_SERVICE, ROUTING_SITE_ID } from "./protocol";

const defineCapability = capabilitiesFor<RoutingServices>();
const revision = z.int().min(1).max(Number.MAX_SAFE_INTEGER);
const message = z.strictObject({ message: contractString({ minLength: 1, maxLength: 2048 }) });
const resolveDomain = defineCapability({
    id: "domains.resolve",
    access: "admin",
    description:
        "Resolve one active domain and issue a short-lived, revision-fenced Edge control lease. This does not grant a CMS user identity.",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    input: z.strictObject({ hostname: contractString({ minLength: 1, maxLength: 253 }) }),
    output: z
        .strictObject({
            hostname: contractString({ minLength: 1, maxLength: 253 }),
            origin: contractString({ minLength: 1, maxLength: 2048 }),
            canonicalOrigin: contractString({ minLength: 1, maxLength: 2048 }),
            instanceId: contractString({ minLength: 1, maxLength: 128 }),
            domainRevision: revision,
            instanceRevision: revision,
            resourceRevision: contractString({ minLength: 36, maxLength: 36 }),
            expiresAt: revision,
            controlLease: contractString({ sensitive: true, minLength: 24, maxLength: 512 }),
        })
        .nullable(),
    errors: {
        INVALID_INPUT: { retryable: false, output: message },
        FORBIDDEN: { retryable: false, output: message },
        CORE_UNAVAILABLE: { retryable: true, output: message },
    },
    docs: ["overview.md"],
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/hosting/routing/resolve",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, FORBIDDEN: 403, CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    authorize: ({ context }) => {
        if (
            context.siteId !== ROUTING_SITE_ID ||
            context.invocation?.instanceId !== ROUTING_INSTANCE_ID ||
            context.invocation.contractId !== ROUTING_CONTRACT_ID ||
            context.systemServiceId !== EDGE_ROUTING_SERVICE ||
            context.subjectId ||
            context.sourceInstallationId ||
            context.controlAuthority ||
            context.connectionId
        ) {
            throw new HostingError("FORBIDDEN", "An authenticated Edge routing machine is required");
        }
    },
    execute: ({ input, services }) => services.routing.resolve(input.hostname),
});
export const routingFeature = defineFeature({
    contractId: ROUTING_CONTRACT_ID,
    version: "1.0.0",
    publisherId: "ulvia",
    name: "Provider domain routing",
    description:
        "Host-owned indexed domain resolution and narrow Edge control credentials, separate from CMS accounts and hosting administration.",
    catalogue: { icon: "server", categories: ["infrastructure"] },
    documents: new URL("../../docs/routing/", import.meta.url),
    capabilities: [resolveDomain],
    mapError: (cause) => ({
        code:
            cause instanceof HostingError && ["INVALID_INPUT", "FORBIDDEN"].includes(cause.code)
                ? cause.code
                : "CORE_UNAVAILABLE",
        output: { message: "The hosting route could not be resolved." },
    }),
});
