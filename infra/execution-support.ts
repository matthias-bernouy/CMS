import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/** Current claims come from the built manifest; older executable releases require explicit evidence. */
export async function writeExecutionSupport(): Promise<void> {
    const root = resolve(import.meta.dir, "../packages/runtimes/ulvia-provider-server");
    const source = resolve(root, "src/runtime/instances/profiles/execution");
    const manifest = JSON.parse(
        await readFile(
            resolve(
                import.meta.dir,
                "../packages/runtimes/ulvia-cli/dist/bootstrap/providers/primary-provider/definition.json",
            ),
            "utf8",
        ),
    ) as {
        providerId: string;
        implementations: { contractId: string; version: string; digest: string }[];
    };
    const { version: buildVersion } = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as {
        version: string;
    };
    const history: unknown = JSON.parse(await readFile(resolve(source, "supported-history.json"), "utf8"));
    if (!Array.isArray(history)) {
        throw new Error("Expected explicit historical execution evidence");
    }
    const releases = [
        ...manifest.implementations.map(({ contractId, version, digest }) => ({ contractId, version, digest })),
        ...history,
    ];
    await writeFile(
        resolve(source, "supported-releases.json"),
        `${JSON.stringify({ providerId: manifest.providerId, buildVersion, releases }, null, 4)}\n`,
    );
}
