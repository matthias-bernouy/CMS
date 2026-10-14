import type {
    ContentReader,
    PageCapabilityRequirement,
    RenderablePage,
    RenderablePageSource,
} from "@bernouy/cms-content/rendering";
import { collectCmsMutationBindings, collectCmsQueryBindings } from "@bernouy/cms-content/rendering";
import { GatewayError } from "cms-gateway/invocation/core/GatewayError";
import type { GatewayExecutionPin, PageExecutionAuthority, PageExecutionConsumer } from "../interfaces/PageExecution";
import { pageCallPrefix, referringPagePath } from "./pageExecutionRoutes";

export type PageCapabilityAccess = "public" | "authenticated" | "admin";

export type ResolvedPageCapability = {
    readonly access: PageCapabilityAccess;
    readonly version: string;
};

export type PageExecutionPage = Pick<RenderablePage, "page" | "requirements">;

export function pageRequiresCapabilityExecution(page: PageExecutionPage): boolean {
    return (
        page.requirements.length > 0 ||
        collectCmsQueryBindings(page.page.content).length > 0 ||
        collectCmsMutationBindings(page.page.content).length > 0
    );
}

export type PageExecutionServiceOptions = {
    readonly siteId: string;
    readonly content: Pick<ContentReader, "getRenderablePage">;
    readonly authority: PageExecutionAuthority;
    readonly resolveCapability: (contractId: string, capabilityId: string) => Promise<ResolvedPageCapability | null>;
};

/** Owns Page capability discovery, access classification and execution grants. */
export class PageExecutionService {
    constructor(private readonly options: PageExecutionServiceOptions) {}

    async requiredAccess(
        page: PageExecutionPage,
        pageUrl: URL,
        callPrefix: string,
    ): Promise<PageCapabilityAccess | null> {
        const requirements = await this.resolveRequirements(page, pageUrl, callPrefix);
        if (!requirements) {
            return null;
        }
        let required: PageCapabilityAccess = "public";
        for (const requirement of requirements) {
            const capability = await this.options
                .resolveCapability(requirement.contractId, requirement.capabilityId)
                .catch(() => null);
            if (!capability) {
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

    async authorizeCall(
        request: Request,
        basePath: string,
        contractId: string,
        capabilityId: string,
    ): Promise<GatewayExecutionPin> {
        const referred = referringPagePath(request, basePath);
        const page = referred ? await this.options.content.getRenderablePage(referred) : null;
        if (!page) {
            throw new GatewayError("not_authorized", "A current Page execution plan is required");
        }
        const pageUrl = new URL(request.headers.get("referer") ?? request.url);
        const requirements = await this.resolveRequirements(page, pageUrl, pageCallPrefix(basePath));
        if (!requirements) {
            throw new GatewayError("not_selected", "A Page capability route could not be resolved");
        }
        const consumer = executionConsumer(this.options.siteId, page.source);
        await this.options.authority.activate({ consumer, requirements });
        return this.options.authority.authorize({ ...consumer, contractId, capabilityId });
    }

    async resolveRequirements(
        page: PageExecutionPage,
        _pageUrl: URL,
        _prefix: string,
    ): Promise<readonly PageCapabilityRequirement[] | null> {
        const requirements = new Map(page.requirements.map((item) => [requirementKey(item), item]));
        for (const query of collectCmsQueryBindings(page.page.content)) {
            if (query.contractId.startsWith("kernel.")) {
                continue;
            }
            const capability = await this.options
                .resolveCapability(query.contractId, query.capabilityId)
                .catch(() => null);
            if (!capability) {
                return null;
            }
            const requirement = {
                contractId: query.contractId,
                capabilityId: query.capabilityId,
                versionRange: `=${capability.version}`,
            };
            requirements.set(requirementKey(requirement), requirement);
        }
        for (const binding of collectCmsMutationBindings(page.page.content)) {
            const capability = await this.options
                .resolveCapability(binding.contractId, binding.capabilityId)
                .catch(() => null);
            if (!capability) {
                return null;
            }
            const requirement = {
                contractId: binding.contractId,
                capabilityId: binding.capabilityId,
                versionRange: `=${capability.version}`,
            };
            requirements.set(requirementKey(requirement), requirement);
        }
        return [...requirements.values()];
    }
}

function executionConsumer(siteId: string, source: RenderablePageSource): PageExecutionConsumer {
    return source.kind === "site"
        ? { kind: "site", siteId, pageId: source.pageId, pageRevision: source.revision }
        : {
              kind: "collection",
              siteId,
              publisherId: source.sourceId,
              collectionId: source.contributionId,
              collectionVersion: source.version,
              collectionDigest: source.digest,
              pageId: source.pageId,
              pageGeneration: source.generation,
          };
}

function requirementKey(requirement: Pick<PageCapabilityRequirement, "contractId" | "capabilityId">): string {
    return `${requirement.contractId}\0${requirement.capabilityId}`;
}
