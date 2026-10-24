import { readSystemSnapshot } from "@bernouy/cms-content";
import { ProviderCapabilityDispatchError, type ProviderCapabilityRegistry } from "../../../dispatch/registry";
import type { CmsContentDependencies } from "../../../ports";
import { configurationCommand, requiredText, revision } from "../support";

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
            if (input.name === undefined && input.host === undefined && input.visible === undefined) {
                throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
            }
            const expectedRevision = revision(input.expectedRevision);
            const system = await dependencies.repo.updateSystem(
                {
                    site: {
                        ...(input.name === undefined ? {} : { name: requiredText(input.name) }),
                        ...(input.host === undefined ? {} : { host: text(input.host) }),
                        ...(input.visible === undefined ? {} : { visible: boolean(input.visible) }),
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
    };
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
