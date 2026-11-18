import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../../queries/types";
import type { WorkspaceReadState } from "./state";
import type { FileCalls } from "../../client";
import type { PreparedSample } from "../../../../harness/execution/samples";

export async function prepareWorkspaceRead(
    state: WorkspaceReadState,
    binding: string,
    index: number,
    other: FileCalls,
    foreign: FileCalls,
    invalid: (input: Readonly<Record<string, unknown>>) => Promise<void>,
): Promise<PreparedSample> {
    const input = { offset: 0, limit: 100 };
    const primed = await state.calls.call("workspace.get", binding, input, state.assertPage);
    assertCondition(primed.observation.validated, "workspace-reader-prime");
    await state.rename(index);
    return {
        async send() {
            return (await state.calls.call("workspace.get", binding, input, state.assertPage)).observation;
        },
        async verify() {
            const before = await state.calls.fixture("workspace.get", input);
            const denied = await foreign.call("workspace.get", "http", input);
            assertCondition(
                !denied.observation.validated && [401, 403].includes(denied.observation.status),
                "workspace-foreign-session",
            );
            const elsewhere = requireRecord(await other.fixture("workspace.get", input));
            assertCondition(
                requireRecord(elsewhere.namespace).id !== state.namespace.id &&
                    Array.isArray(elsewhere.items) &&
                    !elsewhere.items.some((row) => row.fileId === state.file.fileId),
                "workspace-cross-instance-leak",
            );
            await invalid({ fileId: state.file.fileId, name: "invalid-mutation.txt" });
            assertCondition(
                canonicalizeIJson(before) === canonicalizeIJson(await state.calls.fixture("workspace.get", input)),
                "workspace-refusal-mutated-state",
            );
        },
    };
}
