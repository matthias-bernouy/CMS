import type { Db } from "mongodb";
import type { ProviderExecutionStateReader } from "cms-repository/providers/selections/interfaces/ProviderExecutionStateReader";
import type {
    ContractSelectionStore,
    StoredContractSelections,
} from "cms-repository/providers/selections/interfaces/ContractSelectionStore";
import type {
    ProviderInstallationStore,
    StoredProviderInstallation,
} from "cms-repository/providers/installations/interfaces/ProviderInstallationStore";
import { parseSelectionSiteId } from "cms-repository/providers/selections/core/graph/parseContractSelections";
import { parseOpaqueId } from "cms-repository/providers/installations/core/parsing/fields";
import { RevisionedRecordReader } from "./RevisionedRecordReader";

interface Headers {
    readonly current: readonly { revision: number }[];
    readonly installations: readonly { _id: string; revision: number }[];
}

class ChangedDuringRead extends Error {}

/** Join only Repository metadata. Validated store readers decode cold or changed records. */
export class MongoProviderExecutionStateReader implements ProviderExecutionStateReader {
    private readonly selections = new RevisionedRecordReader<StoredContractSelections>();
    private readonly installations = new RevisionedRecordReader<StoredProviderInstallation>();
    private readonly rows;

    constructor(
        private readonly db: Db,
        private readonly selectionStore: Pick<ContractSelectionStore, "get">,
        private readonly installationStore: Pick<ProviderInstallationStore, "get">,
    ) {
        this.rows = db.collection("cms_provider_installations");
    }

    /** Cover header lookups without fetching the full mutable selection or installation document. */
    async init(): Promise<void> {
        await Promise.all([
            this.rows.createIndex({ siteId: 1, _id: 1, revision: 1 }),
            this.db.collection("cms_contract_selections").createIndex({ _id: 1, siteId: 1, revision: 1 }),
        ]);
    }

    async read(siteId: string, installationIds: readonly string[]) {
        const site = parseSelectionSiteId(siteId);
        if (installationIds.length > 32) {
            throw new TypeError("Execution metadata accepts at most 32 installation IDs");
        }
        const ids = [...new Set(Array.from(installationIds, (id) => parseOpaqueId(id, "$.installationId")))];
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                return await this.capture(site, ids);
            } catch (error) {
                if (!(error instanceof ChangedDuringRead) || attempt === 1) {
                    throw error;
                }
            }
        }
        throw new ChangedDuringRead("Execution metadata changed during authorization");
    }

    private async readHeaders(siteId: string, ids: readonly string[]) {
        const headers = await this.rows
            .aggregate<Headers>([
                { $match: { siteId, _id: { $in: ids } } },
                { $project: { _id: 1, revision: 1 } },
                // Even zero matching installations must emit a row for the final selection lookup.
                { $facet: { installations: [{ $limit: 32 }] } },
                // Read selection authority after installation headers, with no speculative first read.
                {
                    $lookup: {
                        from: "cms_contract_selections",
                        pipeline: [{ $match: { _id: siteId, siteId } }, { $project: { _id: 0, revision: 1 } }],
                        as: "current",
                    },
                },
            ])
            .next();
        if (headers && headers.current.length > 1) {
            throw new TypeError("Execution metadata returned an unexpected selection");
        }
        const selectionRevision = headers?.current[0] ? revision(headers.current[0].revision) : null;
        const revisions = new Map<string, number>();
        for (const item of selectionRevision === null ? [] : (headers?.installations ?? [])) {
            if (!ids.includes(item._id) || revisions.has(item._id)) {
                throw new TypeError("Execution metadata returned an unexpected installation");
            }
            revisions.set(item._id, revision(item.revision));
        }
        return { selectionRevision, revisions };
    }

    private async capture(siteId: string, ids: readonly string[]) {
        const { selectionRevision, revisions } = await this.readHeaders(siteId, ids);
        let loaded = false;
        const [selections, installations] = await Promise.all([
            this.selections.get(
                siteId,
                async (revisionOnly) => {
                    if (selectionRevision === null) {
                        return null;
                    }
                    if (revisionOnly) {
                        return { revision: selectionRevision };
                    }
                    loaded = true;
                    const record = await this.selectionStore.get(siteId);
                    if (!record || record.revision !== selectionRevision) {
                        throw new ChangedDuringRead("Selection changed while decoding");
                    }
                    if (record.siteId !== siteId) {
                        throw new TypeError("Selection belongs to another site");
                    }
                    return record;
                },
                (record) => record as StoredContractSelections,
            ),
            Promise.all(
                ids.map((installationId) =>
                    this.installations.get(
                        `${siteId}\0${installationId}`,
                        async (revisionOnly) => {
                            const expected = revisions.get(installationId);
                            if (expected === undefined) {
                                return null;
                            }
                            if (revisionOnly) {
                                return { revision: expected };
                            }
                            loaded = true;
                            const record = await this.installationStore.get({ siteId, installationId });
                            if (!record || record.revision !== expected) {
                                throw new ChangedDuringRead("Installation changed while decoding");
                            }
                            if (record.installation.siteId !== siteId || record.installation.id !== installationId) {
                                throw new TypeError("Installation belongs to another scope");
                            }
                            return record;
                        },
                        (record) => record as StoredProviderInstallation,
                    ),
                ),
            ),
        ]);
        if (loaded) {
            // Cold decoding may await independent stores. Fence those reads before returning authority.
            const current = await this.readHeaders(siteId, ids);
            if (
                current.selectionRevision !== selectionRevision ||
                ids.some((id) => current.revisions.get(id) !== revisions.get(id))
            ) {
                throw new ChangedDuringRead("Execution metadata changed while loading payloads");
            }
        }
        return { selections, installations: installations.filter((item) => item !== null) };
    }
}

function revision(value: number): number {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new TypeError("Execution metadata has an invalid revision");
    }
    return value;
}
