import { capabilitiesFor, contractString, defineFeature, z } from "@bernouy/ulvia-sdk";
import { HostingError } from "hosting/core/errors";
import type { HostingTlsServices } from "hosting/interfaces/tls";

export const TLS_CONTRACT_ID = "ulvia/provider.tls";
export const TLS_INSTANCE_ID = "hosting:tls";
export const TLS_SITE_ID = "hosting";
export const TLS_PERMISSION_PATH = "/hosting/tls/permission";
const capability = capabilitiesFor<HostingTlsServices>();
const message = z.strictObject({ message: contractString({ minLength: 1, maxLength: 2048 }) });
export const hostingTlsFeature = defineFeature({
    contractId: TLS_CONTRACT_ID,
    version: "1.0.0",
    publisherId: "ulvia",
    name: "Provider TLS permission",
    description: "Read-only permission for Caddy certificate automation, separate from CMS and operator authority.",
    catalogue: { icon: "lock", categories: ["infrastructure"] },
    documents: new URL("../../docs/tls/", import.meta.url),
    capabilities: [
        capability({
            id: "certificates.permit",
            access: "public",
            description:
                "Allow TLS only for a registered, ownership-verified HTTPS domain with a ready instance and current installation DNS configuration.",
            behavior: { effect: "query", execution: "sync", sensitive: false },
            input: z.strictObject({ domain: contractString({ minLength: 1, maxLength: 253 }) }),
            output: z.strictObject({ permission: z.literal("allowed") }),
            errors: {
                INVALID_INPUT: { retryable: false, output: message },
                TLS_NOT_ALLOWED: { retryable: false, output: message },
                CORE_UNAVAILABLE: { retryable: true, output: message },
            },
            docs: ["overview.md"],
            bindings: [
                {
                    id: "http",
                    transport: "http",
                    method: "GET",
                    path: TLS_PERMISSION_PATH,
                    input: { query: { domain: "domain" } },
                    response: {
                        successStatuses: [200],
                        contentTypes: ["application/json"],
                        errorStatuses: { INVALID_INPUT: 422, TLS_NOT_ALLOWED: 403, CORE_UNAVAILABLE: 503 },
                    },
                },
            ],
            authorize: ({ context }) => {
                if (
                    context.siteId !== TLS_SITE_ID ||
                    context.invocation?.instanceId !== TLS_INSTANCE_ID ||
                    context.invocation.contractId !== TLS_CONTRACT_ID ||
                    context.subjectId ||
                    context.systemServiceId ||
                    context.sourceInstallationId ||
                    context.controlAuthority ||
                    context.connectionId
                ) {
                    throw new HostingError("FORBIDDEN", "TLS permission requires the isolated public hosting scope");
                }
            },
            execute: async ({ input, services }) => {
                await services.hostingTls.permit(input.domain);
                return { permission: "allowed" as const };
            },
        }),
    ],
    mapError: (cause) => ({
        code:
            cause instanceof HostingError
                ? cause.code === "INVALID_INPUT"
                    ? "INVALID_INPUT"
                    : cause.code === "FORBIDDEN"
                      ? "TLS_NOT_ALLOWED"
                      : "CORE_UNAVAILABLE"
                : "CORE_UNAVAILABLE",
        output: { message: "Certificate permission could not be granted." },
    }),
});
