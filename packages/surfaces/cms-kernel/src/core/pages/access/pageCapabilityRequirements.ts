import { collectCmsSourceBindings, type PageCapabilityRequirement } from "@bernouy/cms-content/rendering";
import type KernelCms from "cms-kernel/KernelCms";

/** Resolves the complete direct and transitive capability grammar of one Page. */
export async function resolvePageCapabilityRequirements(
    content: string,
    kernel: KernelCms,
    pageUrl: URL,
    declaredRequirements: readonly PageCapabilityRequirement[] = [],
): Promise<readonly PageCapabilityRequirement[] | null> {
    const requirements = new Map<string, PageCapabilityRequirement>();
    for (const requirement of declaredRequirements) {
        requirements.set(requirementKey(requirement), requirement);
    }

    const bindings = collectCmsSourceBindings(content);
    if (bindings.length === 0) {
        return [...requirements.values()];
    }
    const gateway = kernel.capabilityGateway;
    if (!gateway) {
        return null;
    }
    const prefix = `${kernel.basePath.replace(/\/$/u, "")}/.cms/call/`;
    for (const binding of bindings) {
        const route = sourceRoute(binding.url, pageUrl, prefix);
        if (!route) {
            continue;
        }
        const resolved = await gateway.invoker
            .resolveHttp({
                siteId: gateway.siteId,
                contractId: route.contractId,
                method: binding.method,
                path: route.path,
            })
            .catch(() => null);
        if (!resolved) {
            return null;
        }
        const requirement = {
            contractId: route.contractId,
            capabilityId: resolved.capability.id,
            versionRange: ">=0.0.0",
        };
        requirements.set(requirementKey(requirement), requirement);
    }
    return [...requirements.values()];
}

function sourceRoute(rawUrl: string, pageUrl: URL, prefix: string): { contractId: string; path: string } | null {
    try {
        const url = new URL(rawUrl, pageUrl);
        if (url.origin !== pageUrl.origin || !url.pathname.startsWith(prefix)) {
            return null;
        }
        const suffix = url.pathname.slice(prefix.length);
        const separator = suffix.indexOf("/");
        const contractId = decodeURIComponent(separator < 0 ? suffix : suffix.slice(0, separator));
        return contractId ? { contractId, path: separator < 0 ? "/" : suffix.slice(separator) } : null;
    } catch {
        return null;
    }
}

function requirementKey(requirement: Pick<PageCapabilityRequirement, "contractId" | "capabilityId">): string {
    return `${requirement.contractId}\0${requirement.capabilityId}`;
}
