import { resolve } from "node:path";
import { ClientFailure } from "../../clients/failure";
import { assertOwnedNamespaceCleanup } from "./ownership";
import type { OwnedStack, Namespace } from "./ownership";

let compiled: Promise<string> | undefined;
async function cleanupProgram(): Promise<string> {
    const result = await Bun.build({ entrypoints: [resolve(import.meta.dir, "namespace-program.ts")], target: "bun" });
    if (!result.success || result.outputs.length !== 1) {
        throw new Error("Could not build fixture cleanup");
    }
    return result.outputs[0]!.text();
}

/** Credentials travel over stdin, never process arguments, logs, or measurement records. */
export async function cleanupNamespace(
    stack: OwnedStack,
    family: "files" | "secrets",
    credentials: Namespace,
    name: string,
): Promise<void> {
    assertOwnedNamespaceCleanup(stack, credentials, name);
    const program = await (compiled ??= cleanupProgram());
    const child = Bun.spawn(["docker", "exec", "-i", stack.providerName, "bun", "--no-macros", "-e", program], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        timeout: 30_000,
    });
    child.stdin.write(
        JSON.stringify({
            family,
            namespaceId: credentials.namespaceId,
            namespaceKey: credentials.namespaceKey,
            name,
            stackId: stack.id,
            providerName: stack.providerName,
            instanceId: stack.instanceId,
        }),
    );
    child.stdin.end();
    const [code, output] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
    ]);
    if (code !== 0 || output !== "cleaned") {
        throw new ClientFailure("fixture-namespace-cleanup-port-failed");
    }
}
