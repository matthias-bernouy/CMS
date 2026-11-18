import { assertCondition } from "../../queries/types";
import { fileReadOracle } from "./oracle";
import { verifyNamespaceRead } from "./checks";
import type { NamespaceReadState } from "./state/namespace";
import type { FileCalls } from "../client";
import type { PreparedSample } from "../../../harness/execution/samples";

export async function prepareNamespaceRead(
    state: NamespaceReadState,
    capability: string,
    profile: string,
    index: number,
    other: FileCalls,
    invalid: () => Promise<void>,
): Promise<PreparedSample> {
    // Exhausted pages are verified separately; every timed list page contains current files.
    const offset = (index % Math.max(1, Math.ceil(state.files.length / 16))) * 16;
    const input = () => {
        if (capability === "namespace.get") {
            return state.childInput;
        }
        if (capability === "files.list") {
            return { ...state.credentials, offset, limit: 16 };
        }
        if (capability === "files.get") {
            return { ...state.credentials, fileId: state.current.reference.fileId };
        }
        return {
            fileId: state.current.reference.fileId,
            generation: state.current.reference.generation,
            ...(capability === "representations.read" ? { profile: "thumbnail", width: 64 } : {}),
        };
    };
    const oracle = () =>
        capability === "namespace.get"
            ? state.assertNamespace
            : fileReadOracle(state.current, state.origin, capability, state.files, offset);
    if (profile === "invalidation") {
        const primed = await state.calls.call(capability, "http", input(), oracle());
        assertCondition(primed.observation.validated, "file-reader-prime-failed");
        if (capability === "namespace.get") {
            await state.rotate();
        } else {
            const old = input();
            await state.replace(index + 1);
            if (["files.read", "representations.read", "representations.list"].includes(capability)) {
                await state.calls.fixture("files.make-private", {
                    ...state.credentials,
                    fileId: state.current.reference.fileId,
                });
                for (const selected of [old, input()]) {
                    const refused = await state.calls.call(capability, "http", selected);
                    assertCondition(
                        !refused.observation.validated && refused.observation.status === 403,
                        "file-privacy-cache-not-invalidated",
                    );
                }
                await state.calls.fixture("files.publish", {
                    ...state.credentials,
                    fileId: state.current.reference.fileId,
                });
            }
        }
    }
    const selected = input();
    const assert = oracle();
    return {
        async send() {
            return (await state.calls.call(capability, "http", selected, assert)).observation;
        },
        verify: () => verifyNamespaceRead(state, capability, selected, other, invalid),
    };
}
