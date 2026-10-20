import type { PageCapabilityRequirement, RenderablePage } from "@bernouy/cms-content/rendering";
import { collectCmsMutationBindings, collectCmsQueryBindings } from "@bernouy/cms-content/rendering";
import { satisfiesVersionRange } from "@bernouy/cms-repository/contracts/compatibility";

export type PageCapabilityAccess = "public" | "authenticated" | "admin";

export type ResolvedPageCapability = {
    readonly access: PageCapabilityAccess;
    readonly version: string;
};

export type PageCapabilityDocument = Pick<RenderablePage, "page" | "requirements">;

export interface PageCapabilityAccessPort {
    requiredAccess(page: PageCapabilityDocument): Promise<PageCapabilityAccess | null>;
}

export type PageCapabilityAnalyzerOptions = {
    readonly resolveCapability: (contractId: string, capabilityId: string) => Promise<ResolvedPageCapability | null>;
};

export function pageRequiresCapabilityAnalysis(page: PageCapabilityDocument): boolean {
    return (
        page.requirements.length > 0 ||
        collectCmsQueryBindings(page.page.content).length > 0 ||
        collectCmsMutationBindings(page.page.content).length > 0
    );
}

/** Analyzes declared Page dependencies and derives the minimum caller access level. */
export class PageCapabilityAnalyzer implements PageCapabilityAccessPort {
    constructor(private readonly options: PageCapabilityAnalyzerOptions) {}

    async requiredAccess(page: PageCapabilityDocument): Promise<PageCapabilityAccess | null> {
        const requirements = await this.resolveRequirements(page);
        if (!requirements) {
            return null;
        }
        let required: PageCapabilityAccess = "public";
        for (const requirement of requirements) {
            const capability = await this.resolve(requirement.contractId, requirement.capabilityId);
            if (!capability || !satisfiesVersionRange(capability.version, requirement.versionRange)) {
                return null;
            }
            if (capability.access === "admin") {
                required = "admin";
            } else if (capability.access === "authenticated" && required === "public") {
                required = "authenticated";
            }
        }
        return required;
    }

    async resolveRequirements(page: PageCapabilityDocument): Promise<readonly PageCapabilityRequirement[] | null> {
        const requirements = new Map(page.requirements.map((item) => [requirementKey(item), item]));
        for (const binding of [
            ...collectCmsQueryBindings(page.page.content),
            ...collectCmsMutationBindings(page.page.content),
        ]) {
            if (binding.contractId.startsWith("kernel.")) {
                continue;
            }
            const key = requirementKey(binding);
            if (requirements.has(key)) {
                continue;
            }
            const capability = await this.resolve(binding.contractId, binding.capabilityId);
            if (!capability) {
                return null;
            }
            requirements.set(key, {
                contractId: binding.contractId,
                capabilityId: binding.capabilityId,
                versionRange: `=${capability.version}`,
            });
        }
        return [...requirements.values()];
    }

    private resolve(contractId: string, capabilityId: string): Promise<ResolvedPageCapability | null> {
        return this.options.resolveCapability(contractId, capabilityId).catch(() => null);
    }
}

function requirementKey(requirement: Pick<PageCapabilityRequirement, "contractId" | "capabilityId">): string {
    return `${requirement.contractId}\0${requirement.capabilityId}`;
}
