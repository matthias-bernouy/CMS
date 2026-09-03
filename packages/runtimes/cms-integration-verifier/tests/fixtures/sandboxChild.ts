import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { parseCanonicalVerificationSandboxInput, runCanonicalVerificationSandboxProgram } from "../../src";
import { validSandboxResult } from "./result";

const mode = process.argv[2] ?? "valid";
const sidecar = process.argv[3];

if (mode === "hang") {
    if (sidecar) {
        await writeFile(sidecar, String(process.pid));
    }
    process.on("SIGTERM", () => undefined);
    setInterval(() => undefined, 1_000);
} else if (mode === "output") {
    if (sidecar) {
        await writeFile(sidecar, String(process.pid));
    }
    process.stdout.write("x".repeat(256 * 1_024));
    setInterval(() => undefined, 1_000);
} else if (mode === "stale-fence") {
    const input = await parseCanonicalVerificationSandboxInput(await readStdin(), 40 * 1_048_576);
    const result = await validSandboxResult(input);
    process.stdout.write(
        Buffer.from(
            canonicalJsonBytes({
                ...result,
                verification: {
                    ...result.verification,
                    fencingToken: result.verification.fencingToken + 1,
                },
            }),
        ),
    );
} else if (mode === "orphan") {
    const input = await parseCanonicalVerificationSandboxInput(await readStdin(), 40 * 1_048_576);
    const orphan = spawn(process.execPath, [import.meta.filename, "hang"], {
        detached: false,
        stdio: "ignore",
    });
    if (sidecar && orphan.pid) {
        await writeFile(sidecar, String(orphan.pid));
    }
    orphan.unref();
    const result = await validSandboxResult(input);
    process.stdout.write(Buffer.from(canonicalJsonBytes(result)));
} else if (mode === "failure-diagnostic") {
    await readStdin();
    process.stderr.write(
        "failed at https://user:password@example.test/path token=abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJ\n",
    );
    process.exitCode = 1;
} else {
    await runCanonicalVerificationSandboxProgram(async (input) => {
        const result = await validSandboxResult(input);
        if (mode !== "inspect-env") {
            return result;
        }
        return {
            ...result,
            verification: {
                ...result.verification,
                results: result.verification.results.map((suite, index) =>
                    index === 0
                        ? {
                              ...suite,
                              diagnostics: [
                                  {
                                      code: "sandbox-environment",
                                      message: JSON.stringify(process.env),
                                      redacted: true,
                                  },
                              ],
                          }
                        : suite,
                ),
            },
        };
    });
}

async function readStdin(): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    for await (const chunk of process.stdin) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}
