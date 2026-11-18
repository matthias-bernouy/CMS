import { assertCondition, requireRecord } from "../../../queries/types";
import { sourceReadFixture } from "./source";
import { assertSourcePublication } from "./oracle";
import type { PublishedSource } from "./oracle";
import type { AuthoredSource } from "./source";
import type { AuthoredKind } from "../../../../fixtures/authored";
import type { ContractParentReference } from "@bernouy/ulvia-contracts";
import type { authoringCalls } from "../../client";

export type SourcePreparation = Readonly<{
    source: AuthoredSource;
    input: Readonly<{ preparationId: string; expectedDigest: string }>;
}>;

export function sourceReadState(
    calls: ReturnType<typeof authoringCalls>,
    namespace: string,
    implementation: ContractParentReference,
    kinds: readonly AuthoredKind[],
    expanded = false,
) {
    const pending = new Set<string>();
    const published: PublishedSource[] = [];
    const latest = new Map<AuthoredKind, PublishedSource>();
    const source = (kind: AuthoredKind, patch: number, large = false) =>
        sourceReadFixture(kind, namespace, implementation, patch, large && expanded ? "expanded" : large);
    const prepare = async (selected: AuthoredSource): Promise<SourcePreparation> => {
        assertCondition(pending.size < 3, "source-pending-preparation-bound");
        const output = requireRecord(
            await calls.fixture(`prepare-${selected.kind}`, { sourceJson: selected.sourceJson }),
        );
        assertCondition(
            output.valid === true &&
                typeof output.preparationId === "string" &&
                typeof output.digest === "string" &&
                Array.isArray(output.diagnostics) &&
                output.diagnostics.length === 0,
            "source-reader-preparation-invalid",
        );
        pending.add(output.preparationId);
        return { source: selected, input: { preparationId: output.preparationId, expectedDigest: output.digest } };
    };
    const record = (prepared: SourcePreparation, output: unknown) => {
        const receipt = assertSourcePublication(prepared.source, prepared.input.expectedDigest, output);
        assertCondition(
            published.length < 33 &&
                !published.some(
                    (row) => row.source.id === receipt.source.id && row.source.version === receipt.source.version,
                ),
            "source-publication-history-bound",
        );
        published.push(receipt);
        latest.set(receipt.source.kind, receipt);
        return receipt;
    };
    const discard = async (preparation: SourcePreparation) => {
        await calls.fixture("discard-preparation", { preparationId: preparation.input.preparationId });
        pending.delete(preparation.input.preparationId);
    };
    const publish = async (selected: AuthoredSource) => {
        const prepared = await prepare(selected);
        const result = record(prepared, await calls.fixture(`publish-${selected.kind}`, prepared.input));
        await discard(prepared);
        return result;
    };
    return {
        calls,
        source,
        prepare,
        record,
        discard,
        publish,
        published,
        latest(kind: AuthoredKind) {
            const value = latest.get(kind);
            assertCondition(value, "source-reader-kind-not-published");
            return value;
        },
        async initialize(profile: string) {
            for (const kind of kinds) {
                for (let patch = 0; patch < (profile === "history" ? 8 : 1); patch++) {
                    await publish(source(kind, patch, profile === "large"));
                }
            }
        },
        async close() {
            const settled = await Promise.allSettled(
                [...pending].map((preparationId) => calls.fixture("discard-preparation", { preparationId })),
            );
            assertCondition(
                settled.every((row) => row.status === "fulfilled"),
                "source-reader-preparation-cleanup",
            );
            pending.clear();
        },
    };
}

export type SourceReadState = ReturnType<typeof sourceReadState>;
