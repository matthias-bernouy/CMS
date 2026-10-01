import { LocalArtifactFiles } from "../repository/artifactFiles";
import { LocalContractReleases } from "../repository/contracts";
import { LocalCollectionRepository } from "../repository/local";
import { LocalProviderReleases } from "../repository/providers";
import type { CollectionDashboardNavigationItem } from "@bernouy/cms-repository/collections";

function countDashboardViews(items: readonly CollectionDashboardNavigationItem[]): number {
    return items.reduce(
        (count, item) => count + Number(Boolean(item.use)) + countDashboardViews(item.children ?? []),
        0,
    );
}

/** Serve only releases explicitly stored in the persistent local repository. */
export function startLocalRepository(port: number, root: string) {
    const collections = new LocalCollectionRepository(root);
    const files = new LocalArtifactFiles(root);
    const contracts = new LocalContractReleases(files);
    const providers = new LocalProviderReleases(files, contracts);
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port,
        async fetch(request) {
            if (request.method !== "GET") {
                return new Response(null, { status: 405 });
            }
            const parts = new URL(request.url).pathname.split("/");
            if (parts[1] !== "v1") {
                return new Response(null, { status: 404 });
            }
            const type = parts[2];
            if (parts.length === 3) {
                if (type === "collections") {
                    const releases = (await collections.list()).map(({ release, digest }) => ({
                        publisherId: release.publisherId,
                        collectionId: release.collectionId,
                        version: release.version,
                        digest,
                        name: release.name,
                        description: release.description ?? "",
                        blocCount: release.blocs.length,
                        hasTheme: Boolean(release.theme),
                        dashboards: (release.dashboards ?? []).map((dashboard) => ({
                            id: dashboard.id,
                            name: dashboard.name,
                            ...(dashboard.icon ? { icon: dashboard.icon } : {}),
                            description: dashboard.description ?? "",
                            viewCount: dashboard.views?.length ?? countDashboardViews(dashboard.navigation ?? []),
                        })),
                    }));
                    return listResponse(releases);
                }
                if (type === "contracts") {
                    const releases = (await (await contracts.catalogue()).list()).map(({ admission, publishedAt }) => ({
                        publisherId: admission.release.publisherId,
                        contractId: admission.release.contractId,
                        version: admission.release.version,
                        digest: admission.digest,
                        name: admission.release.name,
                        description: admission.release.description ?? "",
                        icon: admission.release.catalogue?.icon,
                        categories: admission.release.catalogue?.categories,
                        publishedAt,
                    }));
                    return listResponse(releases);
                }
                if (type === "providers") {
                    const releases = (await (await providers.catalogue()).list()).map(({ admission }) => ({
                        publisherId: admission.manifest.provenance.publisherId,
                        providerId: admission.manifest.providerId,
                        version: admission.manifest.version,
                        digest: admission.digest,
                        name: admission.manifest.name,
                        links: admission.manifest.links,
                    }));
                    return listResponse(releases);
                }
            }
            if (parts.length === 8 && type === "contracts" && parts[6] === "fixtures") {
                try {
                    const [publisherId, id, version, assetId] = [parts[3]!, parts[4]!, parts[5]!, parts[7]!].map(
                        decodeURIComponent,
                    );
                    const record = await (await contracts.catalogue()).get(id!, version!);
                    if (!record || record.admission.release.publisherId !== publisherId) {
                        return notFound();
                    }
                    const declared = record.admission.release.fixtureAssets?.find((asset) => asset.id === assetId);
                    if (!declared) {
                        return notFound();
                    }
                    const bytes = await files.fixture(record.admission.canonicalJson, assetId!);
                    return new Response(new Uint8Array(bytes), {
                        headers: {
                            "Content-Type": declared.mediaType,
                            ETag: `"${declared.digest}"`,
                            "Cache-Control": "public, max-age=31536000, immutable",
                        },
                    });
                } catch (error) {
                    if (error instanceof URIError) {
                        return notFound();
                    }
                    throw error;
                }
            }
            if (parts.length !== 6) {
                return new Response(null, { status: 404 });
            }
            let coordinate: string[];
            try {
                coordinate = parts.slice(3).map(decodeURIComponent);
            } catch {
                return new Response(null, { status: 404 });
            }
            const [publisherId, id, version] = coordinate as [string, string, string];
            if (type === "collections") {
                const artifact = await collections.get(publisherId, id, version);
                return artifact ? releaseResponse(artifact.canonicalJson, artifact.digest) : notFound();
            }
            if (type === "contracts") {
                const record = await (await contracts.catalogue()).get(id, version);
                return record?.admission.release.publisherId === publisherId
                    ? releaseResponse(record.admission.canonicalJson, record.admission.digest)
                    : notFound();
            }
            if (type === "providers") {
                const record = await (await providers.catalogue()).get(id, version);
                return record?.admission.manifest.provenance.publisherId === publisherId
                    ? releaseResponse(record.admission.canonicalJson, record.admission.digest)
                    : notFound();
            }
            return notFound();
        },
    });
    return { url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
}

function listResponse(releases: unknown[]): Response {
    return Response.json({ releases }, { headers: { "Cache-Control": "no-store" } });
}

function releaseResponse(canonicalJson: string, digest: string): Response {
    return new Response(canonicalJson, {
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            ETag: `"${digest}"`,
            "Cache-Control": "public, max-age=31536000, immutable",
        },
    });
}

function notFound(): Response {
    return new Response(null, { status: 404 });
}
