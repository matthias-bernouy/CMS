import * as fs from "node:fs";
import { docker } from "../../../integration/instance/docker";
import { TRACE_DIRECTORY } from "../instrumentation/records";
import { ClientFailure } from "../clients/failure";
import type { MeasuredStack } from "./collect";

type TraceIo = Readonly<{
    lstatSync: (path: string) => { isDirectory: () => boolean; isFile: () => boolean };
    readdirSync: (path: string, options: { encoding: "utf8" }) => string[];
    unlinkSync: (path: string) => void;
}>;

/** Self-contained so the same preflight and deletion logic runs in the owned candidate container. */
export function clearTraceDirectory(directory: string, io: TraceIo = fs) {
    if (!io.lstatSync(directory).isDirectory()) {
        throw new Error("Trace directory must be a real directory");
    }
    const names = io.readdirSync(directory, { encoding: "utf8" });
    if (names.length > 100_000) {
        throw new Error("Trace cleanup file budget exceeded");
    }
    // Validate the complete set before deleting anything. Metadata lives outside this directory.
    for (const name of names) {
        if (!/^[a-f0-9]{64}\.ndjson$/u.test(name) || !io.lstatSync(`${directory}/${name}`).isFile()) {
            throw new Error("Trace cleanup encountered an unexpected filesystem entry");
        }
    }
    for (const name of names) {
        io.unlinkSync(`${directory}/${name}`);
    }
    return { removed: names.length };
}

/** Only call at a quiescent boundary, after preparation/restart and before any measured request. */
export async function clearPreparationTraces(stack: MeasuredStack) {
    if (
        !/^ulvia-mcp-[a-f0-9]{8}$/u.test(stack.id) ||
        stack.providerName !== `${stack.id}-provider` ||
        stack.edgeName !== `${stack.id}-edge`
    ) {
        throw new ClientFailure("trace-cleanup-scope-refused");
    }
    const script = `const result=(${clearTraceDirectory.toString()})(${JSON.stringify(TRACE_DIRECTORY)},require("node:fs"));console.log(JSON.stringify(result))`;
    const results = await Promise.allSettled(
        [stack.providerName, stack.edgeName].map(async (name) => {
            const response = await docker(["exec", name, "bun", "--no-macros", "-e", script]);
            const result = JSON.parse(response.stdout);
            if (!Number.isSafeInteger(result.removed) || result.removed < 0 || result.removed > 100_000) {
                throw new ClientFailure("trace-cleanup-acknowledgement-invalid");
            }
        }),
    );
    if (results.some((result) => result.status === "rejected")) {
        throw new ClientFailure("trace-cleanup-failed");
    }
}
