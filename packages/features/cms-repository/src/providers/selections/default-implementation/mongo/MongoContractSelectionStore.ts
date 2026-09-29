import type { Db } from "mongodb";
import { MongoServerError } from "mongodb";
import { assertIJson, deepFreeze } from "cms-repository/exports/contracts/protocol";
import { ContractSelectionValidationError } from "../../core/errors";
import { DEFAULT_CONTRACT_SELECTION_LIMITS, type ContractSelectionLimits, selectionLimits } from "../../core/limits";
import { parseContractSelections, parseSelectionSiteId } from "../../core/parseContractSelections";
import { planContractSelections } from "../../core/planContractSelections";
import type {
    ContractSelectionDependencySource,
    ContractSelectionStore,
    StoredContractSelections,
} from "../../interfaces/ContractSelectionStore";

interface SelectionDocument extends StoredContractSelections {
    readonly _id: string;
}

/** Persisted site selections with full-graph validation and revision CAS. */
export class MongoContractSelectionStore implements ContractSelectionStore {
    readonly #collection;
    readonly #limits: Readonly<ContractSelectionLimits>;

    constructor(
        db: Db,
        readonly dependencies: ContractSelectionDependencySource,
        limits: Readonly<ContractSelectionLimits> = DEFAULT_CONTRACT_SELECTION_LIMITS,
    ) {
        this.#collection = db.collection<SelectionDocument>("cms_contract_selections");
        this.#limits = selectionLimits(limits);
    }

    async get(siteId: string): Promise<StoredContractSelections | null> {
        const site = parseSelectionSiteId(siteId);
        const document = await this.#collection.findOne({ _id: site });
        return document ? readSelectionDocument(document, site, this.#limits) : null;
    }

    async replace(siteId: string, value: unknown, expectedRevision: number): Promise<StoredContractSelections> {
        const site = parseSelectionSiteId(siteId);
        if (
            !Number.isSafeInteger(expectedRevision) ||
            expectedRevision < 0 ||
            expectedRevision === Number.MAX_SAFE_INTEGER
        ) {
            throw new ContractSelectionValidationError(
                "revision_conflict",
                "expected revision must be a nonnegative safe incrementable integer",
            );
        }
        // Snapshot before awaiting the dependency graph so caller mutations cannot change the proposal.
        const selections = parseContractSelections(value, this.#limits);
        const snapshot = await this.dependencies.capture(site);
        const revision = snapshot.revision;
        if (typeof revision !== "string" || !revision.length || revision.length > 256) {
            throw new ContractSelectionValidationError(
                "stale_dependencies",
                "dependency snapshot needs a bounded revision",
            );
        }
        const plan = await planContractSelections(site, selections, snapshot, this.#limits);
        if (!(await this.dependencies.isCurrent(site, revision))) {
            throw new ContractSelectionValidationError(
                "stale_dependencies",
                "dependencies changed during selection validation",
            );
        }
        const record: StoredContractSelections = {
            siteId: site,
            revision: expectedRevision + 1,
            dependencyRevision: revision,
            plan,
        };
        if (expectedRevision === 0) {
            try {
                await this.#collection.insertOne({ _id: site, ...structuredClone(record) });
            } catch (error) {
                if (error instanceof MongoServerError && error.code === 11000) {
                    throw new ContractSelectionValidationError(
                        "revision_conflict",
                        "site selections changed since they were read",
                    );
                }
                throw error;
            }
        } else {
            const result = await this.#collection.replaceOne(
                { _id: site, revision: expectedRevision },
                structuredClone(record),
            );
            if (result.matchedCount !== 1) {
                throw new ContractSelectionValidationError(
                    "revision_conflict",
                    "site selections changed since they were read",
                );
            }
        }
        return deepFreeze(structuredClone(record));
    }
}

function readSelectionDocument(
    document: SelectionDocument,
    site: string,
    limits: Readonly<ContractSelectionLimits>,
): StoredContractSelections {
    if (
        document.siteId !== site ||
        !Number.isSafeInteger(document.revision) ||
        document.revision < 1 ||
        typeof document.dependencyRevision !== "string" ||
        !document.dependencyRevision.length ||
        document.dependencyRevision.length > 256 ||
        document.plan.siteId !== site ||
        document.plan.structurallyValid !== true ||
        document.plan.runtimeReadiness !== "not-evaluated" ||
        !Array.isArray(document.plan.dependencies) ||
        document.plan.dependencies.length > limits.maxDependencies
    ) {
        throw new Error("Stored contract selections have invalid metadata");
    }
    const selections = parseContractSelections(document.plan.selections, limits);
    if (selections.some((selection) => selection.siteId !== site)) {
        throw new Error("Stored contract selections contain another site");
    }
    const { _id, ...record } = document;
    assertIJson(record, limits.maxJsonDepth);
    if (new TextEncoder().encode(JSON.stringify(record)).byteLength > limits.maxDocumentBytes * 4) {
        throw new Error("Stored contract selections exceed the document limit");
    }
    return deepFreeze(structuredClone(record));
}
