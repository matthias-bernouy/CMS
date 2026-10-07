import { LocalArtifactFiles } from "../artifacts/files";
import { LocalContractReleases } from "../contracts";
import { LocalCollectionRepository } from "../artifacts/collections";
import { LocalProviderReleases } from "../providers";
import { LocalRepositoryYanks } from "../yanks";
import { FilesystemRepositoryCatalogueIndex } from "../catalogueIndex";
import { readCatalogue } from "./catalogue";

export class RepositoryReadEndpoint {
    private readonly collections: LocalCollectionRepository;
    private readonly yanks: LocalRepositoryYanks;
    private readonly contracts: LocalContractReleases;
    private readonly providers: LocalProviderReleases;
    private readonly index: FilesystemRepositoryCatalogueIndex;
    private readonly refreshCatalogueReads: boolean;

    constructor(root: string, index?: FilesystemRepositoryCatalogueIndex) {
        this.collections = new LocalCollectionRepository(root);
        const files = new LocalArtifactFiles(root);
        this.yanks = new LocalRepositoryYanks(root);
        this.contracts = new LocalContractReleases(files, this.yanks);
        this.providers = new LocalProviderReleases(files, this.contracts, this.yanks);
        this.index = index ?? new FilesystemRepositoryCatalogueIndex(root);
        this.refreshCatalogueReads = index === undefined;
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
            return (await readCatalogue(request, type, this.index, this.refreshCatalogueReads)) ?? notFound();
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
                const artifact = await this.collections.getMetadata(publisherId, id, version);
                return artifact ? releaseResponse(artifact.canonicalJson, artifact.digest) : notFound();
            }
            if (type === "contracts") {
                const artifact = await this.contracts.getMetadata(publisherId, id, version);
                return artifact ? releaseResponse(artifact.canonicalJson, artifact.digest) : notFound();
            }
            if (type === "providers") {
                const artifact = await this.providers.getMetadata(publisherId, id, version);
                return artifact ? releaseResponse(artifact.canonicalJson, artifact.digest) : notFound();
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
            const fixture = await this.contracts.getFixture(publisherId!, id!, version!, assetId!);
            if (!fixture) {
                return notFound();
            }
            return assetResponse(fixture.bytes, fixture.definition.mediaType, fixture.definition.digest);
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
            const asset = await this.collections.getAsset(publisherId!, id!, version!, assetId!);
            if (!asset) {
                return notFound();
            }
            return assetResponse(asset.bytes, asset.definition.mediaType, asset.definition.digest);
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

function assetResponse(bytes: Uint8Array | Blob, mediaType: string, digest: string): Response {
    return new Response(bytes instanceof Blob ? bytes : Buffer.from(bytes), {
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
