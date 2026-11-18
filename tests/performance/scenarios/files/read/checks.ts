import { assertCondition } from "../../queries/types";
import { fileReadOracle } from "./oracle";
import type { NamespaceReadState } from "./state/namespace";
import type { FileCalls } from "../client";

export async function verifyNamespaceRead(
    state: NamespaceReadState,
    capability: string,
    input: Readonly<Record<string, unknown>>,
    other: FileCalls,
    invalid: () => Promise<void>,
) {
    const before = await state.snapshot();
    const privateInput = { ...state.credentials, namespaceKey: state.foreign.namespaceKey };
    const denied = await state.calls.call("namespace.get", "http", privateInput);
    assertCondition(
        !denied.observation.validated && [403, 404].includes(denied.observation.status),
        "file-cross-namespace-authorized",
    );
    const elsewhere = await other.call(capability, "http", input);
    assertCondition(
        !elsewhere.observation.validated && [403, 404].includes(elsewhere.observation.status),
        "file-cross-instance-authorized",
    );
    await invalid();
    if (capability !== "namespace.get") {
        for (let offset = 0; offset <= state.files.length; offset += 16) {
            const page = await state.calls.call(
                "files.list",
                "http",
                { ...state.credentials, offset, limit: 16 },
                fileReadOracle(state.current, state.origin, "files.list", state.files, offset),
            );
            assertCondition(page.observation.validated, "file-reader-full-pagination");
        }
        const missing = await state.calls.call(
            "files.list",
            "http",
            { ...state.credentials, offset: state.files.length, limit: 16 },
            fileReadOracle(state.current, state.origin, "files.list", state.files, state.files.length),
        );
        assertCondition(missing.observation.validated, "file-reader-exhausted-page");
        for (const file of state.generations) {
            const old = await state.calls.call(
                "files.read",
                "http",
                { fileId: file.reference.fileId, generation: file.reference.generation },
                fileReadOracle(file, state.origin, "files.read", [], 0),
            );
            assertCondition(old.observation.validated, "file-historical-generation-not-readable");
        }
        const inaccessible = await state.calls.call("files.get", "http", {
            ...privateInput,
            fileId: state.current.reference.fileId,
        });
        assertCondition(
            !inaccessible.observation.validated && [403, 404].includes(inaccessible.observation.status),
            "file-foreign-key-metadata",
        );
    }
    assertCondition((await state.snapshot()) === before, "file-refusal-mutated-state");
}
