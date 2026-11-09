import {
    defineCapability,
    hostingErrors as errors,
    hostingBindings,
    authorizeHosting,
    hostingActor,
    projectDomain,
} from "./policy";
import {
    claimDomainInput,
    claimDomainOutput,
    changeDomainInput,
    domainSchema,
    domainPageInput,
    domainPage,
} from "../schemas";

export const claimDomain = defineCapability({
    id: "domains.claim",
    description: "Reserve a domain exclusively for a hosted instance and return its ownership proof.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "natural", sensitive: true },
    input: claimDomainInput,
    output: claimDomainOutput,
    errors,
    docs: ["overview.md"],
    bindings: hostingBindings("domains.claim", true),
    authorize: authorizeHosting,
    execute: async ({ input, services, context }) => {
        const result = await services.hosting.domains.claim(hostingActor(context), input.instanceId, input.origin);
        return { ...result, domain: projectDomain(result.domain) };
    },
});
export const listDomains = defineCapability({
    id: "domains.list",
    description: "List a bounded page of domains belonging to a hosted instance.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    input: domainPageInput,
    output: domainPage,
    errors,
    docs: ["overview.md"],
    bindings: hostingBindings("domains.list", false),
    authorize: authorizeHosting,
    execute: async ({ input, services, context }) => {
        const page = await services.hosting.domains.list(
            hostingActor(context),
            input.instanceId,
            input.after,
            input.limit,
        );
        return { items: page.items.map(projectDomain), nextCursor: page.nextCursor };
    },
});
export const verifyDomain = defineCapability({
    id: "domains.verify",
    description: "Verify the exact ownership TXT proof for a pending domain claim.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    input: changeDomainInput,
    output: domainSchema,
    errors,
    docs: ["overview.md"],
    bindings: hostingBindings("domains.verify", true),
    authorize: authorizeHosting,
    execute: async ({ input, services, context }) =>
        projectDomain(
            await services.hosting.domains.verify(hostingActor(context), input.hostname, input.expectedRevision),
        ),
});
export const disableDomain = defineCapability({
    id: "domains.disable",
    description: "Disable a domain at its current revision; the installation Control domain is protected.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    input: changeDomainInput,
    output: domainSchema,
    errors,
    docs: ["overview.md"],
    bindings: hostingBindings("domains.disable", true),
    authorize: authorizeHosting,
    execute: async ({ input, services, context }) =>
        projectDomain(
            await services.hosting.domains.disable(hostingActor(context), input.hostname, input.expectedRevision),
        ),
});
