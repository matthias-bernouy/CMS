import type { PageCapabilityRequirement, RenderablePage } from "@bernouy/cms-content/rendering";
import { collectCmsMutationBindings, collectCmsQueryBindings } from "@bernouy/cms-content/rendering";
import { satisfiesVersionRange } from "@bernouy/cms-repository/contracts/compatibility";

export type PageCapabilityAccess = "public" | "authenticated" | "admin";

export type ResolvedPageCapability = {
    readonly access: PageCapabilityAccess;
    readonly version: string;
};

type ResolvedPageContract = {
    readonly version: string;
    readonly capabilities: readonly {
        readonly id: string;
        readonly access: PageCapabilityAccess;
    }[];
};

export type PageCapabilityDocument = Pick<RenderablePage, "page" | "requirements">;

export interface PageCapabilityAccessPort {
    requiredAccess(page: PageCapabilityDocument): Promise<PageCapabilityAccess | null>;
}

export type PageCapabilityAnalyzerOptions = {
    readonly resolveCapability: (contractId: string, capabilityId: string) => Promise<ResolvedPageCapability | null>;
    readonly resolveContract?: (contractId: string) => Promise<ResolvedPageContract | null>;
};

type CapabilityResolver = (contractId: string, capabilityId: string) => Promise<ResolvedPageCapability | null>;

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
        const resolve = this.requestResolver();
        const requirements = await this.resolveRequirementsWith(page, resolve);
        if (!requirements) {
            return null;
        }
        const capabilities = await Promise.all(
            requirements.map((requirement) => resolve(requirement.contractId, requirement.capabilityId)),
        );
        let required: PageCapabilityAccess = "public";
        for (const [index, requirement] of requirements.entries()) {
            const capability = capabilities[index];
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
        return this.resolveRequirementsWith(page, this.requestResolver());
    }

    private async resolveRequirementsWith(
        page: PageCapabilityDocument,
        resolve: CapabilityResolver,
    ): Promise<readonly PageCapabilityRequirement[] | null> {
        const requirements = new Map(page.requirements.map((item) => [requirementKey(item), item]));
        const missing = new Map<string, Pick<PageCapabilityRequirement, "contractId" | "capabilityId">>();
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
            missing.set(key, binding);
        }
        const resolutions = await Promise.all(
            [...missing.values()].map(async (binding) => ({
                binding,
                capability: await resolve(binding.contractId, binding.capabilityId),
            })),
        );
        for (const { binding, capability } of resolutions) {
            if (!capability) {
                return null;
            }
            requirements.set(requirementKey(binding), {
                contractId: binding.contractId,
                capabilityId: binding.capabilityId,
                versionRange: `=${capability.version}`,
            });
        }
        return [...requirements.values()];
    }

    private requestResolver(): CapabilityResolver {
        const capabilities = new Map<string, Promise<ResolvedPageCapability | null>>();
        const contracts = new Map<string, ReturnType<NonNullable<PageCapabilityAnalyzerOptions["resolveContract"]>>>();
        return (contractId, capabilityId) => {
            const key = requirementKey({ contractId, capabilityId });
            const cached = capabilities.get(key);
            if (cached) {
                return cached;
            }
            const pending = this.resolve(contractId, capabilityId, contracts);
            capabilities.set(key, pending);
            return pending;
        };
    }

    private async resolve(
        contractId: string,
        capabilityId: string,
        contracts: Map<string, ReturnType<NonNullable<PageCapabilityAnalyzerOptions["resolveContract"]>>>,
    ): Promise<ResolvedPageCapability | null> {
        if (!this.options.resolveContract) {
            return this.options.resolveCapability(contractId, capabilityId).catch(() => null);
        }
        let contract = contracts.get(contractId);
        if (!contract) {
            contract = this.options.resolveContract(contractId).catch(() => null);
            contracts.set(contractId, contract);
        }
        const resolved = await contract;
        const capability = resolved?.capabilities.find((item) => item.id === capabilityId);
        return resolved && capability ? { access: capability.access, version: resolved.version } : null;
    }
}

function requirementKey(requirement: Pick<PageCapabilityRequirement, "contractId" | "capabilityId">): string {
    return `${requirement.contractId}\0${requirement.capabilityId}`;
}
