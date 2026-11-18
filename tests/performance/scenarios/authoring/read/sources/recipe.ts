import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition } from "../../../queries/types";
import { sourceReadInput } from "./source";
import { sourceReadOracle } from "./oracle";
import type { AuthoredKind } from "../../../../fixtures/authored";
import type { SourceReadState } from "./state";
import type { AuthoringReadContext } from "../context";
import type { ScenarioClient } from "../../../../harness/clients/session";
import type { PreparedSample } from "../../../../harness/execution/samples";

export async function prepareSourceRead(
    state: SourceReadState,
    context: AuthoringReadContext,
    capability: string,
    binding: string,
    profile: string,
    index: number,
    kinds: readonly AuthoredKind[],
    foreign: ScenarioClient,
    invalid: (input: Readonly<Record<string, unknown>>) => Promise<void>,
): Promise<PreparedSample> {
    const kind = kinds[index % kinds.length]!;
    let expected = state.latest(kind);
    if (profile === "invalidation") {
        const next = state.source(kind, index + 1);
        const input = sourceReadInput(next, capability);
        const primed = await state.calls.call(capability, binding, input, (value) =>
            assertCondition(value === null, "source-reader-missing-version-prime"),
        );
        assertCondition(primed.observation.validated, "source-reader-prime-failed");
        expected = await state.publish(next);
    }
    const input = sourceReadInput(expected.source, capability);
    return {
        async send() {
            return (await state.calls.call(capability, binding, input, sourceReadOracle(expected))).observation;
        },
        async verify() {
            const before = canonicalizeIJson(await context.snapshot());
            const denied = await foreign("ulvia/cms.authoring", capability, "http", input);
            assertCondition(
                !denied.observation.validated && [401, 403].includes(denied.observation.status),
                "source-reader-foreign-session",
            );
            const elsewhere = await context.other.call(capability, "http", input);
            assertCondition(
                !elsewhere.observation.validated && elsewhere.observation.status === 422,
                "source-reader-other-publisher-authority",
            );
            await invalid(input);
            for (const receipt of state.published) {
                const saved = await state.calls.call(
                    "get-source-snapshot",
                    "http",
                    sourceReadInput(receipt.source, "get-source-snapshot"),
                    sourceReadOracle(receipt),
                );
                assertCondition(saved.observation.validated, "source-reader-retained-history");
            }
            if (expected.source.sourceJson.length > 1024 * 1024) {
                const named = `get-${kind === "provider-manifest" ? "provider-manifest" : kind}-sources`;
                const limited = await state.calls.call(named, "http", sourceReadInput(expected.source, named));
                assertCondition(
                    !limited.observation.validated && limited.observation.status === 422,
                    "source-reader-named-api-size-bound",
                );
            }
            assertCondition(
                canonicalizeIJson(await context.snapshot()) === before,
                "source-reader-refusal-mutated-state",
            );
        },
    };
}
