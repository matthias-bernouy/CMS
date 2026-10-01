import type { ControlCms } from "cms-control/ControlCms";
import { requireProviderResources } from "cms-control/core/admin/providerResources/access";

export default async function providerCatalogue(request: Request, cms: ControlCms): Promise<Response> {
    const { sources, contracts, manifests } = (await requireProviderResources(request, cms)).resources;
    const [listed, publishedContracts, publishedProviders] = await Promise.all([
        Promise.all(sources.flatMap((source) => [source.list("contract"), source.list("provider-manifest")])).then(
            (lists) => lists.flat(),
        ),
        contracts.list(),
        manifests.list(),
    ]);
    const publishedByDigest = new Map<string, (typeof publishedContracts)[number]>(
        publishedContracts.map((record) => [record.admission.digest, record]),
    );
    const available = listed.map((entry) => {
        if (entry.kind !== "contract") {
            return entry;
        }
        const published = publishedByDigest.get(entry.digest);
        return {
            ...entry,
            ...(entry.icon || !published?.admission.release.catalogue?.icon
                ? {}
                : { icon: published.admission.release.catalogue.icon }),
            ...(entry.categories || !published?.admission.release.catalogue?.categories
                ? {}
                : { categories: published.admission.release.catalogue.categories }),
            ...(entry.publishedAt || !published ? {} : { publishedAt: published.publishedAt }),
        };
    });
    return Response.json(
        {
            repositories: sources.map((source) => source.id),
            available,
            imported: [
                ...publishedContracts.map(({ admission, publishedAt }) => ({
                    kind: "contract",
                    id: admission.release.contractId,
                    version: admission.release.version,
                    digest: admission.digest,
                    publisherId: admission.release.publisherId,
                    name: admission.release.name,
                    description: admission.release.description ?? "",
                    icon: admission.release.catalogue?.icon,
                    categories: admission.release.catalogue?.categories,
                    publishedAt,
                })),
                ...publishedProviders.map(({ admission }) => ({
                    kind: "provider-manifest",
                    id: admission.manifest.providerId,
                    version: admission.manifest.version,
                    digest: admission.digest,
                    publisherId: admission.manifest.provenance.publisherId,
                    name: admission.manifest.name,
                    defaultOrigin: admission.manifest.endpoint.defaultOrigin ?? "",
                    links: admission.manifest.links,
                })),
            ],
        },
        { headers: { "Cache-Control": "private, no-store" } },
    );
}
