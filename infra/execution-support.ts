import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compileRetainedFeatures } from "@bernouy/ulvia-provider/build";

/** Exact executable claims come only from the SDK-backed manifest shipped with this build. */
export async function writeExecutionSupport(
    bootstrapRoot: string,
    repositoryRoot = resolve(import.meta.dir, ".."),
): Promise<void> {
    const root = resolve(repositoryRoot, "packages/runtimes/ulvia-provider-server");
    const source = resolve(root, "dist/generated");
    const edge = resolve(root, "../cms-edge-server/dist/generated");
    const provider = resolve(repositoryRoot, "packages/surfaces/ulvia-provider/dist/generated");
    await Promise.all([source, edge, provider].map((directory) => mkdir(directory, { recursive: true })));
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
    for (const build of await compileRetainedFeatures()) {
        for (const { contractId, version, digest } of build.implementations) {
            if (!releases.some((pin) => pin.digest === digest)) {
                releases.push({ contractId, version, digest });
            }
        }
    }
    await writeFile(
        resolve(edge, "supported.json"),
        `${JSON.stringify(
            releases.filter(({ contractId }) => contractId === "ulvia/cms.installations"),
            null,
            4,
        )}\n`,
    );
    const routingPath = resolve(bootstrapRoot, "contracts/provider.routing/definition.json");
    const routing = releases.find(({ contractId }) => contractId === "ulvia/provider.routing");
    if (!routing) {
        throw new Error("The official inventory has no host routing contract");
    }
    await writeFile(
        resolve(edge, "routing-contract.json"),
        `${JSON.stringify({ ...routing, canonicalJson: (await readFile(routingPath, "utf8")).trim() }, null, 4)}\n`,
    );
    await writeFile(
        resolve(source, "supported-releases.json"),
        `${JSON.stringify({ providerId: manifest.providerId, buildVersion, releases }, null, 4)}\n`,
    );
    await cp(resolve(bootstrapRoot, "feature-runtime.json"), resolve(provider, "runtime.json"));
}
