import { ProviderCapabilityDispatchError, type ProviderCapabilityRegistry } from "../../dispatch/registry";
import type { CmsAccessDependencies } from "../../ports";
import { accessCommand, projectSite, requiredText, revision } from "./support";

export function registerAccessConfigurationCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    dependencies: CmsAccessDependencies,
): void {
    dispatcher.register("ulvia.cms.access", "update-site", async (input) =>
        accessCommand(async () => {
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
