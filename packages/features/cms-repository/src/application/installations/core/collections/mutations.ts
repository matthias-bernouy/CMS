import type {
    InstallationServices,
    CollectionSourceReader,
} from "cms-repository/application/installations/interfaces/services";
import type {
    InstallCollectionInput,
    PlanCollectionUpgradeInput,
} from "cms-repository/application/installations/interfaces/inputs";
import { InstallationError } from "cms-repository/application/installations/core/errors";
import { configurationObject, textOverrides } from "cms-repository/application/installations/core/configuration";
import {
    projectSnapshot,
    projectUpgradePlan,
} from "cms-repository/application/installations/core/collections/projection";
export async function collectionTargets(
    value: PlanCollectionUpgradeInput["targets"],
    sources?: CollectionSourceReader,
    prepared?: readonly { digest: string; repositoryId: string }[],
) {
    const staged =
        prepared ??
        (sources
            ? await sources.stage(value)
            : value.map(({ digest, repositoryId }) => ({ digest, ...(repositoryId ? { repositoryId } : {}) })));
    return staged.map((target, index) => {
        const input = value[index]!;
        return {
            ...target,
            ...(input.configurationJson === undefined
                ? {}
                : { configuration: configurationObject(input.configurationJson) }),
            ...(input.textOverridesJson === undefined ? {} : { textOverrides: textOverrides(input.textOverridesJson) }),
        };
    });
}
export async function installCollections(
    services: InstallationServices,
    siteId: string,
    input: InstallCollectionInput,
) {
    const before = await services.collections.listInstalled(siteId);
    if (before.revision !== input.expectedRevision) {
        throw new InstallationError("REVISION_CONFLICT");
    }
    const staged = await collectionTargets(input.targets, services.sources);
    const installed = new Set(before.items.map(({ collectionId }) => collectionId));
    for (const target of staged) {
        const artifact = await services.collections.getRelease(target.digest);
        if (artifact && installed.has(artifact.release.collectionId)) {
            throw new InstallationError("INVALID_STATE");
        }
    }
    return projectSnapshot(await services.collections.installMany(siteId, staged, input.expectedRevision));
}
export async function planCollections(
    services: InstallationServices,
    siteId: string,
    targets: PlanCollectionUpgradeInput["targets"],
) {
    const prepared = await services.sources?.prepare(targets);
    const staged = await collectionTargets(
        targets,
        services.sources,
        prepared?.map(({ target }) => target),
    );
    return projectUpgradePlan(
        await services.collectionUpgrades.plan(
            siteId,
            staged,
            prepared?.map(({ artifact }) => artifact),
        ),
        structuredClone(targets),
    );
}
