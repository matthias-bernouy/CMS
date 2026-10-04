import { LocalArtifactFiles } from "../artifactFiles";
import { LocalContractReleases } from "../contracts";
import { LocalCollectionRepository } from "../local";
import { LocalProviderReleases } from "../providers";
import { LocalRepositoryYanks } from "../yanks";
import { readCatalogue } from "./catalogue";

export class RepositoryReadEndpoint {
    private readonly collections: LocalCollectionRepository;
    private readonly files: LocalArtifactFiles;
    private readonly yanks: LocalRepositoryYanks;
    private readonly contracts: LocalContractReleases;
    private readonly providers: LocalProviderReleases;

    constructor(root: string) {
        this.collections = new LocalCollectionRepository(root);
        this.files = new LocalArtifactFiles(root);
        this.yanks = new LocalRepositoryYanks(root);
        this.contracts = new LocalContractReleases(this.files, this.yanks);
        this.providers = new LocalProviderReleases(this.files, this.contracts, this.yanks);
    }

    async handle(request: Request): Promise<Response | null> {
        if (request.method !== "GET") {
            return null;
        }
        const parts = new URL(request.url).pathname.split("/");
        if (parts[1] !== "v1") {
            return notFound();
        }
        const type = parts[2];
        if (parts.length === 3) {
            return (
                (await readCatalogue(type, {
                    collections: this.collections,
                    contracts: this.contracts,
                    providers: this.providers,
                    yanks: this.yanks,
                })) ?? notFound()
            );
        }
        if (parts.length === 8 && type === "contracts" && parts[6] === "fixtures") {
            return this.contractFixture(parts);
        }
        if (parts.length === 8 && type === "collections" && parts[6] === "assets") {
            return this.collectionAsset(parts);
        }
        if (parts.length !== 6) {
            return notFound();
        }
        try {
            const [publisherId, id, version] = parts.slice(3).map(decodeURIComponent) as [string, string, string];
            if (type === "collections") {
                const artifact = await this.collections.get(publisherId, id, version);
                return artifact ? releaseResponse(artifact.canonicalJson, artifact.digest) : notFound();
            }
            if (type === "contracts") {
                const record = await (await this.contracts.catalogue()).get(id, version);
                return record?.admission.release.publisherId === publisherId
                    ? releaseResponse(record.admission.canonicalJson, record.admission.digest)
                    : notFound();
            }
            if (type === "providers") {
                const record = await (await this.providers.catalogue()).get(id, version);
                return record?.admission.manifest.provenance.publisherId === publisherId
                    ? releaseResponse(record.admission.canonicalJson, record.admission.digest)
                    : notFound();
            }
            return notFound();
        } catch (error) {
            if (error instanceof URIError) {
                return notFound();
            }
            throw error;
        }
    }

    private async contractFixture(parts: string[]): Promise<Response> {
        try {
            const [publisherId, id, version, assetId] = [parts[3]!, parts[4]!, parts[5]!, parts[7]!].map(
                decodeURIComponent,
            );
            const record = await (await this.contracts.catalogue()).get(id!, version!);
            const declared = record?.admission.release.fixtureAssets?.find((asset) => asset.id === assetId);
            if (!record || record.admission.release.publisherId !== publisherId || !declared) {
                return notFound();
            }
            const bytes = await this.files.fixture(record.admission.canonicalJson, assetId!);
            return assetResponse(bytes, declared.mediaType, declared.digest);
        } catch (error) {
            if (error instanceof URIError) {
                return notFound();
            }
            throw error;
        }
    }

    private async collectionAsset(parts: string[]): Promise<Response> {
        try {
            const [publisherId, id, version, assetId] = [parts[3]!, parts[4]!, parts[5]!, parts[7]!].map(
                decodeURIComponent,
            );
            const artifact = await this.collections.get(publisherId!, id!, version!);
            const declared = artifact?.release.assets.find((asset) => asset.id === assetId);
            const stored = artifact?.assets.find((asset) => asset.id === assetId);
            if (!artifact || !declared || !stored) {
                return notFound();
            }
            return assetResponse(new Uint8Array(await stored.bytes.arrayBuffer()), declared.mediaType, declared.digest);
        } catch (error) {
            if (error instanceof URIError) {
                return notFound();
            }
            throw error;
        }
    }
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

function assetResponse(bytes: Uint8Array, mediaType: string, digest: string): Response {
    return new Response(Buffer.from(bytes), {
        headers: {
            "Content-Type": mediaType,
            ETag: `"${digest}"`,
            "Cache-Control": "public, max-age=31536000, immutable",
        },
    });
}

function notFound(): Response {
    return new Response(null, { status: 404 });
}
