import { deepFreeze } from "cms-repository/exports/contracts/protocol";
import { ContractSelectionValidationError } from "../core/errors";
import { DEFAULT_CONTRACT_SELECTION_LIMITS, type ContractSelectionLimits, selectionLimits } from "../core/limits";
import { parseContractSelections, parseSelectionSiteId } from "../core/parseContractSelections";
import { planContractSelections } from "../core/planContractSelections";
import type {
    ContractSelectionDependencySource,
    ContractSelectionStore,
    StoredContractSelections,
} from "../interfaces/ContractSelectionStore";

/** Atomic within this store. Dependency authority owns coherent capture and revision consistency. */
export class InMemoryContractSelectionStore implements ContractSelectionStore {
    readonly #records = new Map<string, StoredContractSelections>();
    readonly #pending = new Map<string, Promise<unknown>>();
    readonly #limits: Readonly<ContractSelectionLimits>;

    constructor(
        readonly dependencies: ContractSelectionDependencySource,
        limits: Readonly<ContractSelectionLimits> = DEFAULT_CONTRACT_SELECTION_LIMITS,
    ) {
        this.#limits = selectionLimits(limits);
    }

    async get(siteId: string): Promise<StoredContractSelections | null> {
        const record = this.#records.get(parseSelectionSiteId(siteId));
        return record ? deepFreeze(structuredClone(record)) : null;
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
        // Parse before enqueueing so caller mutation cannot change the pending replacement.
        const selections = parseContractSelections(value, this.#limits);
        const previous = this.#pending.get(site) ?? Promise.resolve();
        const pending = previous
            .catch(() => undefined)
            .then(async () => {
                if ((this.#records.get(site)?.revision ?? 0) !== expectedRevision) {
                    throw new ContractSelectionValidationError(
                        "revision_conflict",
                        "site selections changed since they were read",
                    );
                }
                const snapshot = await this.dependencies.capture(site);
                if (
                    typeof snapshot.revision !== "string" ||
                    !snapshot.revision.length ||
                    snapshot.revision.length > 256
                ) {
                    throw new ContractSelectionValidationError(
                        "stale_dependencies",
                        "dependency snapshot needs a bounded revision",
                    );
                }
                const revision = snapshot.revision;
                const plan = await planContractSelections(site, selections, snapshot, this.#limits);
                if (!(await this.dependencies.isCurrent(site, revision))) {
                    throw new ContractSelectionValidationError(
                        "stale_dependencies",
                        "dependencies changed during selection validation",
                    );
                }
                const record = deepFreeze({
                    siteId: site,
                    revision: expectedRevision + 1,
                    dependencyRevision: revision,
                    plan,
                });
                this.#records.set(site, record);
                return deepFreeze(structuredClone(record));
            });
        this.#pending.set(site, pending);
        try {
            return await pending;
        } finally {
            if (this.#pending.get(site) === pending) {
                this.#pending.delete(site);
            }
        }
    }
}
