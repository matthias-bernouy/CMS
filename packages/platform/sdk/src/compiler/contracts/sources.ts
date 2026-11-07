import { ownOperations } from "ulvia-sdk/compiler/contracts/operations";
import { DEFAULT_RELEASE_LIMITS } from "@bernouy/ulvia-contracts";
import type { ContractRelease } from "@bernouy/ulvia-contracts";
import type { ContractDefinition } from "ulvia-sdk/interfaces/contracts";
import { compileCapability } from "ulvia-sdk/compiler/contracts/capabilities";
import { snapshotFixtures } from "ulvia-sdk/compiler/contracts/fixtures";
import { SDK_BUILD_LIMITS } from "ulvia-sdk/compiler/limits";
import { snapshotDocuments } from "ulvia-sdk/compiler/contracts/documents";
import { SdkDefinitionError } from "ulvia-sdk/schema/errors";

type ReleaseSource = Omit<ContractRelease, "extends" | "documentation">;

export interface ContractSourceSnapshot {
    readonly release: ReleaseSource;
    readonly fixtures: ReturnType<typeof snapshotFixtures>;
    readonly documents: ReturnType<typeof snapshotDocuments>;
    readonly parent?: ContractSourceSnapshot;
}

/** Capture all declarative source data before admission performs asynchronous hashing. */
export function snapshotContracts(sources: readonly ContractDefinition[]): readonly ContractSourceSnapshot[] {
    if (sources.length > SDK_BUILD_LIMITS.contracts) {
        throw new SdkDefinitionError("Too many root contract definitions");
    }
    const snapshots = new Map<ContractDefinition, ContractSourceSnapshot>();
    const active = new Set<ContractDefinition>();
    const ordered: ContractSourceSnapshot[] = [];
    function visit(source: ContractDefinition, depth: number): ContractSourceSnapshot {
        if (active.has(source)) {
            throw new SdkDefinitionError("Cyclic contract inheritance", "$.extends");
        }
        const existing = snapshots.get(source);
        if (existing) {
            return existing;
        }
        if (
            depth > DEFAULT_RELEASE_LIMITS.maxSchemaDepth ||
            snapshots.size + active.size >= DEFAULT_RELEASE_LIMITS.maxCapabilities
        ) {
            throw new SdkDefinitionError("Contract graph exceeds the compilation budget");
        }
        active.add(source);
        const parent = source.extends ? visit(source.extends, depth + 1) : undefined;
        const { contractId, name, publisherId, version, description, catalogue } = source;
        const operations = ownOperations(source).sort((left, right) =>
            left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
        );
        const snapshot: ContractSourceSnapshot = {
            release: {
                ...structuredClone({
                    contractId,
                    name,
                    publisherId,
                    version,
                    ...(description === undefined ? {} : { description }),
                    ...(catalogue === undefined ? {} : { catalogue }),
                }),
                kind: "contract",
                protocol: "ulvia-provider/v1",
                schemaDialect: "ulvia-schema/v1",
                capabilities: operations.map(compileCapability),
            },
            documents: snapshotDocuments(source.documents),
            fixtures: snapshotFixtures(source.fixtures),
            ...(parent ? { parent } : {}),
        };
        active.delete(source);
        snapshots.set(source, snapshot);
        ordered.push(snapshot);
        return snapshot;
    }
    for (const source of sources) {
        visit(source, 1);
    }
    return ordered;
}
