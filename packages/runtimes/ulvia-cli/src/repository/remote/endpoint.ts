import { admitCollectionReleaseJson } from "@bernouy/cms-repository/collections";
import { LocalArtifactFiles } from "../artifactFiles";
import { LocalContractReleases } from "../contracts";
import { withRepositoryWriteLock } from "../lock";
import { LocalCollectionRepository } from "../local";
import { LocalProviderReleases } from "../providers";
import { LocalRepositoryYanks, type RepositoryArtifactKind } from "../yanks";
import { matchesRepositoryToken, verifyRepositoryRequest } from "./auth";
import { parsePublication, parseYank, readRepositoryMutationBody } from "./protocol";

export class RepositoryMutationEndpoint {
    private readonly signatures = new Map<string, number>();

    constructor(
        private readonly root: string,
        private readonly token?: string,
    ) {}

    async handle(request: Request): Promise<Response | null> {
        const url = new URL(request.url);
        if (url.search) {
            return null;
        }
        if (request.method === "POST" && url.pathname === "/v1/publications") {
            return this.authorized(request, (bytes) => this.publish(bytes));
        }
        if (request.method === "PUT" && url.pathname.startsWith("/v1/yanks/")) {
            return this.authorized(request, (bytes) => this.yank(url.pathname, bytes));
        }
        return null;
    }

    private async authorized(request: Request, mutation: (bytes: Uint8Array) => Promise<unknown>): Promise<Response> {
        if (!this.token) {
            return response(405, "repository_read_only", "Repository mutations are disabled");
        }
        if (!matchesRepositoryToken(request, this.token)) {
            return response(401, "invalid_signature", "Repository request authentication failed");
        }
        let bytes: Uint8Array;
        try {
            bytes = await readRepositoryMutationBody(request);
        } catch (error) {
            return response(413, "request_too_large", errorMessage(error));
        }
        const signature = verifyRepositoryRequest(request, bytes, this.token);
        if (!signature || this.replayed(signature)) {
            return response(401, "invalid_signature", "Repository request authentication failed");
        }
        try {
            return Response.json(await mutation(bytes), { status: 200 });
        } catch (error) {
            return response(409, "publication_rejected", errorMessage(error));
        }
    }

    private async publish(bytes: Uint8Array) {
        const envelope = parsePublication(bytes);
        return withRepositoryWriteLock(this.root, async () => {
            const files = new LocalArtifactFiles(this.root);
            const yanks = new LocalRepositoryYanks(this.root);
            const contracts = new LocalContractReleases(files, yanks);
            if (envelope.kind === "collection") {
                const artifact = await admitCollectionReleaseJson(envelope.canonicalJson, envelope.assets, {
                    contracts: await contracts.catalogue(),
                });
                const added = await new LocalCollectionRepository(this.root).store(artifact);
                return publicationResult(envelope.kind, artifact.release, artifact.digest, added);
            }
            if (envelope.kind === "contract") {
                const { added, admission } = await contracts.publish(envelope.canonicalJson, envelope.assets);
                return publicationResult(envelope.kind, admission.release, admission.digest, added);
            }
            if (envelope.assets.length) {
                throw new Error("Provider manifests cannot contain assets");
            }
            const { added, admission } = await new LocalProviderReleases(files, contracts, yanks).release(
                envelope.canonicalJson,
            );
            return publicationResult(envelope.kind, admission.manifest, admission.digest, added);
        });
    }

    private async yank(path: string, bytes: Uint8Array) {
        const parts = path.split("/");
        if (parts.length !== 7) {
            throw new Error("Invalid yank coordinate");
        }
        const [kind, publisherId, id, version] = parts.slice(3).map(decodeURIComponent);
        if (!isKind(kind)) {
            throw new Error("Invalid yank artifact kind");
        }
        const reason = parseYank(bytes);
        return withRepositoryWriteLock(this.root, async () => {
            await assertPublished(this.root, kind, publisherId!, id!, version!);
            const yank = await new LocalRepositoryYanks(this.root).set(kind, publisherId!, id!, version!, reason);
            return { kind, publisherId, id, version, yank };
        });
    }

    private replayed(signature: string): boolean {
        const now = Date.now();
        for (const [key, timestamp] of this.signatures) {
            if (now - timestamp > 5 * 60 * 1_000) {
                this.signatures.delete(key);
            }
        }
        if (this.signatures.has(signature)) {
            return true;
        }
        this.signatures.set(signature, now);
        return false;
    }
}

async function assertPublished(
    root: string,
    kind: RepositoryArtifactKind,
    publisherId: string,
    id: string,
    version: string,
): Promise<void> {
    if (kind === "collection") {
        if (!(await new LocalCollectionRepository(root).get(publisherId, id, version))) {
            throw new Error("Collection release is not published");
        }
        return;
    }
    const files = new LocalArtifactFiles(root);
    if (!(await files.get(kind === "contract" ? "contracts" : "providers", publisherId, id, version))) {
        throw new Error(`${kind} release is not published`);
    }
}

function publicationResult(kind: RepositoryArtifactKind, value: unknown, digest: string, added: boolean) {
    return { kind, added, digest, release: value };
}

function isKind(value: string | undefined): value is RepositoryArtifactKind {
    return value === "collection" || value === "contract" || value === "provider-manifest";
}

function response(status: number, code: string, message: string): Response {
    return Response.json({ error: { code, message } }, { status });
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Repository mutation failed";
}
