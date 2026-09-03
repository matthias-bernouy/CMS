import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    identifyCandidateAdmissionJobResult,
    validateCandidateAdmissionJobResultForPlan,
    type CandidateAdmissionJobResultV1,
} from "@bernouy/cms-integration-verification";
import type { VerificationSandboxInput } from "../supervisor";
import { parseCanonicalVerificationSandboxInput } from "./childProtocol";

export type VerificationSandboxProgram = (
    input: VerificationSandboxInput,
    signal: AbortSignal,
) => Promise<CandidateAdmissionJobResultV1>;

export async function runCanonicalVerificationSandboxProgram(
    program: VerificationSandboxProgram,
    options: Readonly<{ maxInputBytes: number; validation?: "plan" | "structure" }> = {
        maxInputBytes: 40 * 1_048_576,
    },
): Promise<void> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    process.once("SIGTERM", abort);
    process.once("SIGINT", abort);
    try {
        const bytes = await readStdin(options.maxInputBytes);
        const input = await parseCanonicalVerificationSandboxInput(bytes, options.maxInputBytes);
        const result = await program(input, controller.signal);
        const identified =
            options.validation === "structure"
                ? await identifyCandidateAdmissionJobResult(result)
                : await validateCandidateAdmissionJobResultForPlan(
                      result,
                      input.workload.migrationInputs,
                      input.workload.admission,
                      input.workload.policy,
                      input.workload.attempt,
                  );
        await writeStdout(identified.canonicalBytes);
    } finally {
        process.removeListener("SIGTERM", abort);
        process.removeListener("SIGINT", abort);
    }
}

async function readStdin(limit: number): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of process.stdin) {
        total += chunk.byteLength;
        if (total > limit) {
            throw new TypeError("Sandbox stdin exceeds its byte limit");
        }
        chunks.push(chunk);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

async function writeStdout(bytes: Uint8Array): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        process.stdout.write(Buffer.from(bytes), (error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });
}
