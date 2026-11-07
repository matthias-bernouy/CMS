import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/** Exact executable claims come only from the SDK-backed manifest shipped with this build. */
export async function writeExecutionSupport(bootstrapRoot: string): Promise<void> {
    const root = resolve(import.meta.dir, "../packages/runtimes/ulvia-provider-server");
    const source = resolve(root, "src/runtime/instances/profiles/execution");
    const manifest = JSON.parse(
        await readFile(resolve(bootstrapRoot, "providers/primary-provider/definition.json"), "utf8"),
    ) as {
        providerId: string;
        implementations: { contractId: string; version: string; digest: string }[];
    };
    const { version: buildVersion } = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as {
        version: string;
    };
    const releases = manifest.implementations.map(({ contractId, version, digest }) => ({
        contractId,
        version,
        digest,
    }));
    await writeFile(
        resolve(source, "supported-releases.json"),
        `${JSON.stringify({ providerId: manifest.providerId, buildVersion, releases }, null, 4)}\n`,
    );
}
