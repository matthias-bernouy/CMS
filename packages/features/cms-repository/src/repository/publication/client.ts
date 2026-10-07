import { parseCollectionReleaseJson } from "cms-repository/exports/collections/index";
import { parseContractReleaseJson } from "cms-repository/exports/contracts/index";
import { parseProviderManifestJson } from "cms-repository/exports/providers/index";
import { MAX_REPOSITORY_RESPONSE_BYTES } from "cms-repository/repository-http/getBytes";
import { boundedResponseBytes, repositoryUrl } from "./transport";
import type { PublicationEnvelope, RemoteCoordinate, RepositoryArtifactKind, RepositoryDownloadAsset } from "./types";
import { RemoteRepositoryWriter } from "./writer";
import { boundedStream, verifiedAsset } from "./transport/assets";

export type { RemoteCoordinate } from "./types";

const FETCH_CONCURRENCY = 4;

export interface RepositoryAssetDownloadSink {
    get(asset: RepositoryDownloadAsset): Promise<Blob | Uint8Array | null>;
    store(asset: RepositoryDownloadAsset, body: ReadableStream<Uint8Array>): Promise<Blob | Uint8Array>;
}

export class RemoteRepositoryClient {
    private readonly base: URL;
    private readonly writer: RemoteRepositoryWriter;

    constructor(baseUrl: string, token?: string) {
        this.base = repositoryUrl(baseUrl);
        this.writer = new RemoteRepositoryWriter(this.base, token);
    }

    async pull(
        coordinate: RemoteCoordinate,
        assetSink?: RepositoryAssetDownloadSink,
    ): Promise<PublicationEnvelope & { expectedDigest: string }> {
        const path = releasePath(coordinate);
        const response = await this.get(path, MAX_REPOSITORY_RESPONSE_BYTES, "application/json");
        const canonicalJson = new TextDecoder("utf-8", { fatal: true }).decode(response.bytes);
        assertCoordinate(coordinate, canonicalJson);
        const assets = await this.assets(coordinate, canonicalJson, assetSink);
        return { kind: coordinate.kind, canonicalJson, assets, expectedDigest: response.digest };
    }

    async push(envelope: PublicationEnvelope): Promise<{ added: boolean; digest: string }> {
        return this.writer.push(envelope);
    }

    async yank(coordinate: RemoteCoordinate, reason: string | null): Promise<void> {
        return this.writer.yank(coordinate, reason);
    }

    private async assets(coordinate: RemoteCoordinate, canonicalJson: string, assetSink?: RepositoryAssetDownloadSink) {
        if (coordinate.kind === "provider-manifest") {
            return [];
        }
        const definitions =
            coordinate.kind === "collection"
                ? parseCollectionReleaseJson(canonicalJson).assets
                : (parseContractReleaseJson(canonicalJson).fixtureAssets ?? []);
        const directory = coordinate.kind === "collection" ? "assets" : "fixtures";
        const assets = new Array<{ id: string; bytes: Uint8Array | Blob }>(definitions.length);
        let nextIndex = 0;
        const fetchNext = async () => {
            while (nextIndex < definitions.length) {
                const index = nextIndex++;
                const definition = definitions[index]!;
                const path = `${releasePath(coordinate)}/${directory}/${encodeURIComponent(definition.id)}`;
                const bytes = await this.asset(path, definition, assetSink);
                assets[index] = { id: definition.id, bytes };
            }
        };
        await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, definitions.length) }, fetchNext));
        return assets;
    }

    private async asset(
        path: string,
        definition: RepositoryDownloadAsset,
        sink?: RepositoryAssetDownloadSink,
    ): Promise<Blob | Uint8Array> {
        const cached = await sink?.get(definition);
        if (cached && (await verifiedAsset(cached, definition))) {
            return cached;
        }
        const response = await fetch(new URL(path, this.base), {
            headers: { Accept: definition.mediaType },
            redirect: "error",
            signal: AbortSignal.timeout(120_000),
        });
        if (!response.ok || !response.body) {
            throw new Error(`Repository download failed (${response.status})`);
        }
        const declared = Number(response.headers.get("content-length"));
        if (Number.isFinite(declared) && declared > definition.byteLength) {
            throw new Error("Repository response exceeds its declared byte limit");
        }
        const digestHeader = response.headers.get("etag")?.replace(/^"|"$/gu, "");
        if (digestHeader !== definition.digest) {
            throw new Error("Repository asset digest does not match its declaration");
        }
        const bytes = sink
            ? await sink.store(definition, boundedStream(response.body, definition.byteLength))
            : await boundedResponseBytes(response, definition.byteLength);
        if (!(await verifiedAsset(bytes, definition))) {
            throw new Error("Repository asset bytes do not match their declaration");
        }
        return bytes;
    }

    private async get(path: string, maxBytes: number, accept: string) {
        const response = await fetch(new URL(path, this.base), {
            headers: { Accept: accept },
            redirect: "error",
            signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok || !response.body) {
            throw new Error(`Repository download failed (${response.status})`);
        }
        const bytes = await boundedResponseBytes(response, maxBytes);
        const digestHeader = response.headers.get("etag")?.replace(/^"|"$/gu, "");
        if (!digest(digestHeader)) {
            throw new Error("Repository response has no valid immutable digest");
        }
        return { bytes, digest: digestHeader };
    }
}

function assertCoordinate(coordinate: RemoteCoordinate, canonicalJson: string): void {
    const actual = readCoordinate(coordinate.kind, canonicalJson);
    if (
        actual.publisherId !== coordinate.publisherId ||
        actual.id !== coordinate.id ||
        actual.version !== coordinate.version
    ) {
        throw new Error("Repository returned a release that does not match the requested coordinate");
    }
}

function readCoordinate(kind: RepositoryArtifactKind, canonicalJson: string): Omit<RemoteCoordinate, "kind"> {
    if (kind === "collection") {
        const release = parseCollectionReleaseJson(canonicalJson);
        return { publisherId: release.publisherId, id: release.collectionId, version: release.version };
    }
    if (kind === "contract") {
        const release = parseContractReleaseJson(canonicalJson);
        return { publisherId: release.publisherId, id: release.contractId, version: release.version };
    }
    const manifest = parseProviderManifestJson(canonicalJson);
    return {
        publisherId: manifest.provenance.publisherId,
        id: manifest.providerId,
        version: manifest.version,
    };
}

function releasePath(coordinate: RemoteCoordinate): string {
    const type = coordinate.kind === "provider-manifest" ? "providers" : `${coordinate.kind}s`;
    return `v1/${type}/${encodeURIComponent(coordinate.publisherId)}/${encodeURIComponent(coordinate.id)}/${encodeURIComponent(coordinate.version)}`;
}

function digest(value: unknown): value is string {
    return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value);
}
