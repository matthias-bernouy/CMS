import { parseCollectionReleaseJson } from "cms-repository/exports/collections/index";
import { parseContractReleaseJson } from "cms-repository/exports/contracts/index";
import { parseProviderManifestJson } from "cms-repository/exports/providers/index";
import { signRepositoryRequest } from "./auth";
import { encodePublication, type PublicationEnvelope } from "./protocol";
import { boundedResponseBytes, repositoryUrl } from "./transport";
import type { RemoteCoordinate, RepositoryArtifactKind } from "./types";

export type { RemoteCoordinate } from "./types";

const MAX_RELEASE_BYTES = 2 * 1024 * 1024;
const FETCH_CONCURRENCY = 4;

export class RemoteRepositoryClient {
    private readonly base: URL;

    constructor(
        baseUrl: string,
        private readonly token?: string,
    ) {
        this.base = repositoryUrl(baseUrl);
    }

    async pull(coordinate: RemoteCoordinate): Promise<PublicationEnvelope & { expectedDigest: string }> {
        const path = releasePath(coordinate);
        const response = await this.get(path, MAX_RELEASE_BYTES, "application/json");
        const canonicalJson = new TextDecoder("utf-8", { fatal: true }).decode(response.bytes);
        assertCoordinate(coordinate, canonicalJson);
        const assets = await this.assets(coordinate, canonicalJson);
        return { kind: coordinate.kind, canonicalJson, assets, expectedDigest: response.digest };
    }

    async push(envelope: PublicationEnvelope): Promise<{ added: boolean; digest: string }> {
        const value = await this.mutate("POST", "v1/publications", encodePublication(envelope));
        if (!plainRecord(value) || typeof value.added !== "boolean" || !digest(value.digest)) {
            throw new Error("Repository returned an invalid publication result");
        }
        return { added: value.added, digest: value.digest };
    }

    async yank(coordinate: RemoteCoordinate, reason: string | null): Promise<void> {
        const body = Buffer.from(JSON.stringify({ reason }));
        await this.mutate(
            "PUT",
            `v1/yanks/${coordinate.kind}/${encodeURIComponent(coordinate.publisherId)}/${encodeURIComponent(coordinate.id)}/${encodeURIComponent(coordinate.version)}`,
            body,
        );
    }

    private async assets(coordinate: RemoteCoordinate, canonicalJson: string) {
        if (coordinate.kind === "provider-manifest") {
            return [];
        }
        const definitions =
            coordinate.kind === "collection"
                ? parseCollectionReleaseJson(canonicalJson).assets
                : (parseContractReleaseJson(canonicalJson).fixtureAssets ?? []);
        const directory = coordinate.kind === "collection" ? "assets" : "fixtures";
        const assets = new Array<{ id: string; bytes: Uint8Array }>(definitions.length);
        let nextIndex = 0;
        const fetchNext = async () => {
            while (nextIndex < definitions.length) {
                const index = nextIndex++;
                const definition = definitions[index]!;
                const path = `${releasePath(coordinate)}/${directory}/${encodeURIComponent(definition.id)}`;
                const result = await this.get(path, definition.byteLength, definition.mediaType);
                assets[index] = { id: definition.id, bytes: result.bytes };
            }
        };
        await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, definitions.length) }, fetchNext));
        return assets;
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

    private async mutate(method: string, path: string, body: Uint8Array): Promise<unknown> {
        if (!this.token) {
            throw new Error("ULVIA_REPOSITORY_TOKEN is required for repository mutations");
        }
        const url = new URL(path, this.base);
        const signed = signRepositoryRequest(method, url, body, this.token);
        const response = await fetch(url, {
            method,
            body: Buffer.from(body),
            redirect: "error",
            signal: AbortSignal.timeout(60_000),
            headers: {
                Accept: "application/json",
                Authorization: signed.authorization,
                "Content-Type": "application/json",
                "X-Ulvia-Timestamp": signed.timestamp,
                "X-Ulvia-Nonce": signed.nonce,
                "X-Ulvia-Content-SHA256": signed.contentDigest,
                "X-Ulvia-Signature": signed.signature,
            },
        });
        const value = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
            throw new Error(remoteError(value, response.status));
        }
        return value;
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

function remoteError(value: unknown, status: number): string {
    if (plainRecord(value) && plainRecord(value.error) && typeof value.error.message === "string") {
        return `Repository rejected the request (${status}): ${value.error.message}`;
    }
    return `Repository rejected the request (${status})`;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
