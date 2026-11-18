import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { randomUUID } from "node:crypto";
import { operationCompletion } from "../../../../harness/clients/operation";
import { assertCondition, requireRecord } from "../../../queries/types";
import { sourceReadInput } from "../sources/source";
import { sourceReadOracle } from "../sources/oracle";
import { publicationStatusOracle } from "./oracle";
import type { SourceReadState } from "../sources/state";
import type { AuthoringReadContext } from "../context";
import type { ScenarioClient } from "../../../../harness/clients/session";
import type { PreparedSample } from "../../../../harness/execution/samples";

export async function preparePublicationRead(
    state: SourceReadState,
    context: AuthoringReadContext,
    client: ScenarioClient,
    binding: string,
    index: number,
    foreign: ScenarioClient,
    invalid: (input: Readonly<Record<string, unknown>>) => Promise<void>,
): Promise<PreparedSample> {
    const prepared = await state.prepare(state.source("collection", index + 1, true));
    let input: Readonly<Record<string, unknown>> | undefined;
    let observedPending = false;
    const completion = operationCompletion(client, "ulvia/cms.authoring", "get-publication-operation", (id) => ({
        ...prepared.input,
        operationId: id,
    }));
    const response = await state.calls.call("publish-collection-operation", "http", prepared.input, undefined, {
        idempotencyKey: randomUUID(),
        async complete(operationId, signal, recordPoll) {
            input = { ...prepared.input, operationId };
            const prime = await state.calls.call("get-publication-operation", binding, input, (value) => {
                const status = requireRecord(value);
                assertCondition(
                    status.operationId === operationId &&
                        ["queued", "running", "succeeded"].includes(String(status.status)),
                    "source-operation-prime-state",
                );
                observedPending = ["queued", "running"].includes(String(status.status));
            });
            assertCondition(prime.observation.validated, "source-operation-prime-failed");
            return completion(operationId, signal, recordPoll);
        },
    });
    assertCondition(response.observation.validated && input, "source-operation-publication-failed");
    const expected = state.record(prepared, response.output);
    await state.discard(prepared);
    // A publication which finished before priming is not pending-to-terminal coverage.
    assertCondition(observedPending, "source-operation-completed-before-prime");
    const selected = input;
    const oracle = publicationStatusOracle(String(selected.operationId), expected);
    return {
        async send() {
            return (await state.calls.call("get-publication-operation", binding, selected, oracle)).observation;
        },
        async verify() {
            const before = canonicalizeIJson(await context.snapshot());
            const denied = await foreign("ulvia/cms.authoring", "get-publication-operation", "http", selected);
            assertCondition(
                !denied.observation.validated && [401, 403].includes(denied.observation.status),
                "source-operation-foreign-session",
            );
            const elsewhere = await context.other.call("get-publication-operation", "http", selected);
            assertCondition(
                !elsewhere.observation.validated && elsewhere.observation.status === 422,
                "source-operation-cross-instance",
            );
            const wrong = await state.calls.call("get-publication-operation", "http", {
                ...selected,
                expectedDigest: `sha256:${"f".repeat(64)}`,
            });
            assertCondition(
                !wrong.observation.validated && wrong.observation.status === 422,
                "source-operation-wrong-preparation-pin",
            );
            await invalid(selected);
            const snapshot = await state.calls.call(
                "get-source-snapshot",
                "http",
                sourceReadInput(expected.source, "get-source-snapshot"),
                sourceReadOracle(expected),
            );
            assertCondition(snapshot.observation.validated, "source-operation-retained-result");
            const saved = await state.calls.call("get-publication-operation", "http", selected, oracle);
            assertCondition(
                saved.observation.validated && canonicalizeIJson(await context.snapshot()) === before,
                "source-operation-refusal-mutated-state",
            );
        },
    };
}
