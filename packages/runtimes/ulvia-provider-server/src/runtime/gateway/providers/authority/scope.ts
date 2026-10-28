import type { ProviderInvocationIssue } from "@bernouy/cms-gateway/protocol";

/** Fixed runtime services and Provider provenance cannot assert each other's authority. */
export function assertInvocationScope(input: ProviderInvocationIssue): void {
    if (
        input.sourceInstallationId !== undefined &&
        (input.systemServiceId !== undefined || (input.subjectId !== undefined && !input.delegatedTicket))
    ) {
        throw new TypeError("Provider identity cannot impersonate a user or system service");
    }
    if (
        input.sourceInstallationId &&
        (!input.sourceCredentialFingerprint || !/^[a-f0-9]{64}$/.test(input.sourceCredentialFingerprint))
    ) {
        throw Object.assign(new Error("Provider credential proof is missing"), { status: 403 });
    }
    if (input.systemServiceId && (input.subjectId || input.delegation)) {
        throw Object.assign(new Error("Invalid system invocation"), { status: 403 });
    }
    if (input.delegatedTicket && (!input.sourceInstallationId || input.systemServiceId || input.delegation)) {
        throw Object.assign(new Error("Invalid delegated invocation"), { code: "forbidden", status: 403 });
    }
    if (
        input.systemServiceId !== undefined &&
        !(
            (["cms-kernel", "ulvia-provider"].includes(input.systemServiceId) &&
                input.contractId === "ulvia.cms.observability" &&
                input.capabilityId === "logs.append") ||
            (input.systemServiceId === "cms-kernel" &&
                input.contractId === "ulvia.cms.content" &&
                ["delivery.read", "delivery.robots", "delivery.sitemap", "delivery.collection-asset"].includes(
                    input.capabilityId,
                )) ||
            (input.systemServiceId === "cms-gateway" &&
                input.contractId === "ulvia.cms.access" &&
                input.capabilityId === "inspect-actor")
        )
    ) {
        throw Object.assign(new Error("System invocation is not authorized"), { code: "forbidden", status: 403 });
    }
}
