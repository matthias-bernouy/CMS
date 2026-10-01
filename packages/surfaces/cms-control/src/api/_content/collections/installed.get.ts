import type { ControlCms } from "cms-control/ControlCms";
import { collectionService } from "cms-control/core/content/installedCollections/service";
export default async function installed(_req: Request, cms: ControlCms) {
    const { store, siteId } = collectionService(cms);
    const [system, snapshot] = await Promise.all([cms.repository.getSystem(), store.snapshot(siteId)]);
    const collections = await Promise.all(
        snapshot.collections.map(async (collection) => {
            const requirements = uniqueRequirements(collection.release.blocs.flatMap((bloc) => bloc.requires));
            const readiness = cms.config.capabilityGateway?.catalogue
                ? await cms.config.capabilityGateway.catalogue.checkRequirements(siteId, requirements)
                : requirements.map((requirement) => ({
                      ...requirement,
                      status: "missing" as const,
                      reason: "Provider gateway is not configured",
                  }));
            return { ...collection, requirements: readiness };
        }),
    );
    return Response.json(
        {
            ...snapshot,
            collections,
            languages: [system.site.language, ...(system.site.additionalLanguages ?? [])],
        },
        { headers: { "Cache-Control": "private, no-store" } },
    );
}

function uniqueRequirements<T extends { contractId: string; capabilityId: string; versionRange: string }>(
    requirements: readonly T[],
): T[] {
    const seen = new Set<string>();
    return requirements.filter((requirement) => {
        const key = `${requirement.contractId}\0${requirement.capabilityId}\0${requirement.versionRange}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}
