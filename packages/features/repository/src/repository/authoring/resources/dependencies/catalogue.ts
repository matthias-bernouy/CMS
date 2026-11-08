import { verifyStoredContractReleaseJson } from "@bernouy/ulvia-contracts";
import type { CatalogueContractRelease } from "@bernouy/ulvia-contracts/catalogue";
import type { ReleaseCatalogue } from "repository/exports/contracts/catalogue";
import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import {
    dependencyReader,
    AuthoringDependencyError,
} from "repository/repository/authoring/resources/dependencies/transport";
import { resourceReference } from "../../../search/core/input";
import type { CollectionPublisher } from "../../CollectionAuthoring";

/** Request-local, read-only evidence: preparation never imports or installs dependencies. */
export function preparationCatalogue(base: ReleaseCatalogue, publisher: CollectionPublisher): ReleaseCatalogue {
    const read = dependencyReader(publisher);
    const seen = new Set<string>();
    const localLists = new Map<string, Promise<readonly CatalogueContractRelease[]>>();
    const exact = new Map<string, Promise<CatalogueContractRelease | null>>();
    const budget = (key: string) => {
        if (!seen.has(key) && seen.size >= 64) {
            throw new Error("Preparation exceeds 64 contract releases");
        }
        seen.add(key);
    };
    const records = new Map<string, Promise<CatalogueContractRelease>>();
    const queries = new Map<string, Promise<CatalogueContractRelease[]>>();
    let status: ReturnType<CollectionPublisher["connectionStatus"]> | undefined;
    const connected = async () => (await (status ??= publisher.connectionStatus())).configured;
    const unavailable = () => new AuthoringDependencyError();
    async function listed(id: string, version?: string) {
        const key = `${id}\0${version ?? ""}`;
        let pending = queries.get(key);
        if (!pending) {
            if (queries.size >= 64) {
                throw new Error("Preparation exceeds 64 contract lookups");
            }
            pending = (async () => {
                const bytes = await read("v1/catalogue", {
                    query: { kind: "contract", id, ...(version ? { version } : {}), limit: 64, channel: "all" },
                    maxBytes: 1024 * 1024,
                });
                const page = parseStrictJson(bytes, 1024 * 1024, 32) as { releases?: unknown[]; nextCursor?: string };
                if (!Array.isArray(page.releases) || page.releases.length > 64 || page.nextCursor) {
                    throw new Error("Preparation requires at most 64 published versions per contract");
                }
                const coordinates = new Set<string>();
                return Promise.all(
                    page.releases.map(async (row) => {
                        const value = row as Record<string, unknown>;
                        const reference = resourceReference({
                            kind: value.kind,
                            publisherId: value.publisherId,
                            id: value.id,
                            version: value.version,
                            digest: value.digest,
                        });
                        if (
                            reference.kind !== "contract" ||
                            reference.id !== id ||
                            (version && reference.version !== version)
                        ) {
                            throw unavailable();
                        }
                        const recordKey = `${id}\0${reference.version}`;
                        if (coordinates.has(recordKey)) {
                            throw unavailable();
                        }
                        coordinates.add(recordKey);
                        budget(recordKey);
                        let record = records.get(recordKey);
                        if (!record) {
                            if (records.size >= 64) {
                                throw new Error("Preparation exceeds 64 contract releases");
                            }
                            record = (async () => {
                                const path = `v1/releases/contract/${encodeURIComponent(reference.publisherId)}/${encodeURIComponent(id)}/${encodeURIComponent(reference.version)}`;
                                const content = await read(path, {
                                    maxBytes: 1024 * 1024,
                                });
                                const admission = await verifyStoredContractReleaseJson(content, reference.digest);
                                if (
                                    admission.digest !== reference.digest ||
                                    admission.release.contractId !== id ||
                                    admission.release.version !== reference.version ||
                                    admission.release.publisherId !== reference.publisherId
                                ) {
                                    throw unavailable();
                                }
                                return { admission, publishedAt: "1970-01-01T00:00:00.000Z" };
                            })();
                            records.set(recordKey, record);
                        }
                        const cached = await record;
                        if (cached.admission.digest !== reference.digest) {
                            throw unavailable();
                        }
                        return cached;
                    }),
                );
            })();
            queries.set(key, pending);
        }
        return pending;
    }
    const readOnly = async (): Promise<never> => {
        throw new Error("Preparation catalogue is read-only");
    };
    return {
        async get(id, version) {
            const key = `${id}\0${version}`;
            budget(key);
            let pending = exact.get(key);
            if (!pending) {
                pending = (async () => {
                    const local = await base.get(id, version);
                    return local ?? ((await connected()) ? ((await listed(id, version))[0] ?? null) : null);
                })();
                exact.set(key, pending);
            }
            return pending;
        },
        async list(id) {
            if (!id) {
                throw new Error("Preparation requires an exact contract identifier");
            }
            if (await connected()) {
                return listed(id);
            }
            let pending = localLists.get(id);
            if (!pending) {
                if (localLists.size >= 64) {
                    throw new Error("Preparation exceeds 64 local contract lookups");
                }
                pending = base.list(id).then((local) => {
                    if (local.length > 64) {
                        throw new Error("Preparation exceeds 64 contract releases");
                    }
                    for (const record of local) {
                        budget(`${record.admission.release.contractId}\0${record.admission.release.version}`);
                    }
                    return local;
                });
                localLists.set(id, pending);
            }
            return pending;
        },
        async findByDigest(digest) {
            const cached = [...(await Promise.all(records.values())), ...(await Promise.all(exact.values()))];
            return cached.find((record) => record?.admission.digest === digest) ?? base.findByDigest(digest);
        },
        publish: readOnly,
        setDeprecation: readOnly,
        setYank: readOnly,
    };
}
