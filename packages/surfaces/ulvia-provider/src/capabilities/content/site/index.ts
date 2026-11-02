import { coercePageRef, readSystemSnapshot } from "@bernouy/cms-content";
import type { ContentRepository, TSystem } from "@bernouy/cms-content";
import { ProviderCapabilityDispatchError, type ProviderCapabilityRegistry } from "../../../dispatch/registry";
import type { CmsContentDependencies } from "../../../ports";
import { configurationCommand, requiredText, revision } from "../support";

const PAGE_FIELDS = ["notFound", "forbidden", "serverError", "login"] as const;
type SitePageSettings = Pick<TSystem["site"], (typeof PAGE_FIELDS)[number]>;

export function registerSiteCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    dependencies: CmsContentDependencies,
): void {
    dispatcher.register("ulvia.cms.content", "site.get", async () => {
        const snapshot = await readSystemSnapshot(dependencies.repo);
        return projectSite(snapshot.system, snapshot.revision);
    });
    dispatcher.register("ulvia.cms.content", "site.update", async (input) =>
        configurationCommand(async () => {
            const expectedRevision = revision(input.expectedRevision);
            const pages = await sitePageSettings(dependencies.repo, input);
            if (
                input.name === undefined &&
                input.host === undefined &&
                input.visible === undefined &&
                Object.keys(pages).length === 0
            ) {
                throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
            }
            const system = await dependencies.repo.updateSystem(
                {
                    site: {
                        ...(input.name === undefined ? {} : { name: requiredText(input.name) }),
                        ...(input.host === undefined ? {} : { host: text(input.host) }),
                        ...(input.visible === undefined ? {} : { visible: boolean(input.visible) }),
                        ...pages,
                    },
                } as never,
                expectedRevision,
            );
            return projectSite(system, expectedRevision + 1);
        }),
    );
}

function projectSite(system: Awaited<ReturnType<CmsContentDependencies["repo"]["updateSystem"]>>, revision: number) {
    return {
        revision,
        name: system.site.name,
        host: system.site.host,
        visible: system.site.visible,
        notFound: system.site.notFound ?? null,
        forbidden: system.site.forbidden ?? null,
        serverError: system.site.serverError ?? null,
        login: system.site.login ?? null,
    };
}

async function sitePageSettings(
    repository: ContentRepository,
    input: Readonly<Record<string, unknown>>,
): Promise<Partial<SitePageSettings>> {
    const pages: Partial<SitePageSettings> = {};
    for (const field of PAGE_FIELDS) {
        const value = input[field];
        if (value === undefined) {
            continue;
        }
        const reference = typeof value === "object" ? coercePageRef(value) : null;
        if (value !== null && !reference) {
            throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
        }
        pages[field] = reference;
    }
    const pageIds = new Set(Object.values(pages).flatMap((reference) => (reference ? [reference.pageId] : [])));
    for (const pageId of pageIds) {
        if (!(await repository.getPageById(pageId))) {
            throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
        }
    }
    return pages;
}

function text(value: unknown): string {
    if (typeof value !== "string") {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return value;
}

function boolean(value: unknown): boolean {
    if (typeof value !== "boolean") {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return value;
}
