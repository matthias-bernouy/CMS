import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Resolve published entry points before writing a trusted source module outside node_modules. */
export async function writeSdkModule(directory: string) {
    await mkdir(join(directory, "docs"), { recursive: true });
    const definitions = import.meta.resolve("@bernouy/ulvia-sdk");
    const compiler = import.meta.resolve("@bernouy/ulvia-sdk/build");
    await writeFile(
        join(directory, "ulvia.release.ts"),
        String.raw`
import { defineContract, defineOperation, contractString, z } from ${JSON.stringify(definitions)};
import { compileContract } from ${JSON.stringify(compiler)};
import { readFile } from "node:fs/promises";
export default async function () {
    const config = JSON.parse(await readFile(new URL("./release.json", import.meta.url), "utf8"));
    const operation = defineOperation({
        id: "read", access: "public", behavior: { effect: "query", execution: "sync", sensitive: false },
        bindings: [{ id: "http", transport: "http", method: "GET", path: "/read/{id}", input: { path: { id: "id" } }, response: { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: {} } }],
        input: z.strictObject({ id: contractString({ maxLength: config.maxLength }) }),
        output: z.boolean(), errors: {}, docs: ["overview.md"],
    });
    const admission = await compileContract(defineContract({
        contractId: "batch/sdk.example", publisherId: "batch", version: config.version, name: "SDK example",
        documents: new URL("./docs/", import.meta.url),
        operations: [operation],
    }));
    return [{ kind: "contract", admission }];
}
`,
    );
    return async (config: { version?: string; maxLength?: number; documentation?: string } = {}) => {
        await writeFile(
            join(directory, "docs/overview.md"),
            `# SDK example\n\n${config.documentation ?? "Initial documentation."}\n`,
        );
        await writeFile(
            join(directory, "release.json"),
            JSON.stringify({ version: "1.0.0", maxLength: 64, documentation: "Initial documentation.", ...config }),
        );
    };
}
