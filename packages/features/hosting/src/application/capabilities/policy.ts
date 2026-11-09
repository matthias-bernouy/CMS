import { capabilitiesFor, contractString, z } from "@bernouy/ulvia-sdk";
import type { CapabilitySource, FeatureErrorMapper, ProviderCapabilityContext } from "@bernouy/ulvia-sdk";
import type { HostingServices } from "hosting/interfaces/services";
import type { HostingDomain } from "hosting/interfaces/state";
import { HostingError } from "hosting/core/errors";

export const defineCapability = capabilitiesFor<HostingServices>();
const message = z.strictObject({ message: contractString({ minLength: 1, maxLength: 2048 }) });
export const hostingErrors = {
    INVALID_INPUT: { retryable: false, output: message },
    FORBIDDEN: { retryable: false, output: message },
    NOT_FOUND: { retryable: false, output: message },
    CONFLICT: { retryable: false, output: message },
    DOMAIN_UNVERIFIED: { retryable: true, output: message },
    CORE_UNAVAILABLE: { retryable: true, output: message },
} as const;
const response = {
    successStatuses: [200],
    contentTypes: ["application/json"],
    errorStatuses: {
        INVALID_INPUT: 422,
        FORBIDDEN: 403,
        NOT_FOUND: 404,
        CONFLICT: 409,
        DOMAIN_UNVERIFIED: 409,
        CORE_UNAVAILABLE: 503,
    },
} as const;

export function hostingBindings(capability: string, command: boolean) {
    return [
        {
            id: "http",
            transport: "http",
            method: command ? "POST" : "QUERY",
            path: `/hosting/${capability}`,
            input: { body: true },
            response,
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: `hosting_${capability.replaceAll(".", "_")}`,
                description: `Control hosting administration: ${capability}.`,
            },
        },
    ] as const;
}

export function hostingActor(context: ProviderCapabilityContext<CapabilitySource>) {
    if (
        !context.invocation ||
        context.invocation.contractId !== "ulvia/cms.hosting" ||
        !context.subjectId ||
        context.systemServiceId ||
        context.sourceInstallationId ||
        context.controlAuthority
    ) {
        throw new HostingError("FORBIDDEN", "A signed Control administrator invocation is required");
    }
    return { instanceId: context.invocation.instanceId, subjectId: context.subjectId };
}

export async function authorizeHosting({
    context,
    services,
}: {
    context: ProviderCapabilityContext<CapabilitySource>;
    services: HostingServices;
}) {
    await services.hosting.authority.assertAdministrator(hostingActor(context));
}

export function projectDomain(domain: HostingDomain) {
    const { hostname, origin, instanceId, state, tls, revision } = domain;
    return { hostname, origin, instanceId, state, tls, revision };
}

export const mapHostingError: FeatureErrorMapper = (cause) => ({
    code:
        cause instanceof HostingError
            ? cause.code === "UNAVAILABLE"
                ? "CORE_UNAVAILABLE"
                : cause.code
            : cause instanceof TypeError || cause instanceof z.ZodError
              ? "INVALID_INPUT"
              : "CORE_UNAVAILABLE",
    output: { message: "The hosting service could not complete the request." },
});
