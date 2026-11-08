import { capabilitiesFor, defineFeature } from "@bernouy/ulvia-sdk";
import { ProviderConnectionConflict } from "@bernouy/cms-gateway/provider";
import type { ProviderConnectionServices } from "./interfaces";
import { configureConnectionInputSchema, configuredConnectionSchema, connectionErrors } from "./schemas";

const defineCapability = capabilitiesFor<ProviderConnectionServices>();
const configureConnection = defineCapability({
    id: "connections.configure",
    description:
        "Pair an authenticated Provider account with one CMS connection. Connection identity is supplied by verified invocation claims.",
    access: "admin",
    behavior: { effect: "command", idempotency: "natural", execution: "sync", sensitive: true },
    input: configureConnectionInputSchema,
    output: configuredConnectionSchema,
    errors: connectionErrors,
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/provider/connections",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, FORBIDDEN: 403, CORE_UNAVAILABLE: 503, REVISION_CONFLICT: 409 },
            },
        },
    ],
    docs: ["overview.md"],
    execute: ({ input, context, services, fail }) => {
        if (
            context.connectionId !== input.connectionId ||
            context.subjectId ||
            context.sourceInstallationId ||
            context.systemServiceId
        ) {
            throw fail("FORBIDDEN", {
                message: "The verified connection authority does not match this return channel.",
            });
        }
        return services.providerConnections.configure(input);
    },
});
export const providerConnectionsFeature = defineFeature({
    contractId: "ulvia/provider.connections",
    name: "Provider connections",
    description: "Authenticated CMS-to-Provider pairing for one Provider account.",
    version: "1.0.0",
    publisherId: "ulvia",
    catalogue: { icon: "activity", categories: ["administration", "observability"] },
    documents: new URL("../../../../../docs/provider/connections/", import.meta.url),
    mapError: (cause) =>
        cause instanceof ProviderConnectionConflict
            ? {
                  code: "REVISION_CONFLICT",
                  output: { message: "The Provider connection generation conflicts with the current state." },
              }
            : undefined,
    capabilities: [configureConnection],
});
