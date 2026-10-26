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
        if (request.method !== "GET" && request.method !== "HEAD") {
            return null;
        }
        const head = request.method === "HEAD";
        const parts = new URL(request.url).pathname.split("/");
        if (parts[1] !== "v1") {
            return notFound();
        }
        const type = parts[2];
        if (parts.length === 3) {
            const response = (await readCatalogue(request, type, this.index, this.refreshCatalogueReads)) ?? notFound();
            if (!head) {
                return response;
            }
            await response.body?.cancel();
            return new Response(null, { status: response.status, headers: response.headers });
        }
        if (parts.length === 8 && type === "contracts" && parts[6] === "fixtures") {
            return this.contractFixture(parts, head);
        }
        if (parts.length === 8 && type === "collections" && parts[6] === "assets") {
            return this.collectionAsset(parts, head);
        }
        if (parts.length !== 6) {
            return notFound();
        }
        try {
            const [publisherId, id, version] = parts.slice(3).map(decodeURIComponent) as [string, string, string];
            if (type === "collections") {
                const artifact = await this.collections.getMetadata(publisherId, id, version);
                return artifact ? releaseResponse(artifact.canonicalJson, artifact.digest, head) : notFound();
            }
            if (type === "contracts") {
                const artifact = await this.contracts.getMetadata(publisherId, id, version);
                return artifact ? releaseResponse(artifact.canonicalJson, artifact.digest, head) : notFound();
            }
            if (type === "providers") {
                const artifact = await this.providers.getMetadata(publisherId, id, version);
                return artifact ? releaseResponse(artifact.canonicalJson, artifact.digest, head) : notFound();
            }
            return notFound();
        } catch (error) {
            if (error instanceof URIError) {
                return notFound();
            }
            throw error;
        }
    }

    private async contractFixture(parts: string[], head: boolean): Promise<Response> {
        try {
            const [publisherId, id, version, assetId] = [parts[3]!, parts[4]!, parts[5]!, parts[7]!].map(
                decodeURIComponent,
            );
            const fixture = await this.contracts.getFixture(publisherId!, id!, version!, assetId!, head);
            if (!fixture) {
                return notFound();
            }
            return assetResponse(fixture.bytes, fixture.definition.mediaType, fixture.definition.digest, head);
        } catch (error) {
            if (error instanceof URIError) {
                return notFound();
            }
            throw error;
        }
    }

    private async collectionAsset(parts: string[], head: boolean): Promise<Response> {
        try {
            const [publisherId, id, version, assetId] = [parts[3]!, parts[4]!, parts[5]!, parts[7]!].map(
                decodeURIComponent,
            );
            const asset = await this.collections.getAsset(publisherId!, id!, version!, assetId!, head);
            if (!asset) {
                return notFound();
            }
            return assetResponse(asset.bytes, asset.definition.mediaType, asset.definition.digest, head);
        } catch (error) {
            if (error instanceof URIError) {
                return notFound();
            }
            throw error;
        }
    }
}

function releaseResponse(canonicalJson: string, digest: string, head: boolean): Response {
    return new Response(head ? null : canonicalJson, {
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Length": String(Buffer.byteLength(canonicalJson)),
            "Content-Security-Policy": "sandbox; default-src 'none'",
            ETag: `"${digest}"`,
            "Cache-Control": "public, max-age=31536000, immutable",
        },
    });
}

function assetResponse(bytes: Uint8Array | Blob, mediaType: string, digest: string, head: boolean): Response {
    return new Response(head ? null : bytes instanceof Blob ? bytes : Buffer.from(bytes), {
        headers: {
            "Content-Type": mediaType,
            "Content-Length": String(bytes instanceof Blob ? bytes.size : bytes.byteLength),
            ETag: `"${digest}"`,
            "Cache-Control": "public, max-age=31536000, immutable",
        },
    });
}

function notFound(): Response {
    return new Response(null, { status: 404 });
}
