import { parseContractReleaseJson } from "@bernouy/ulvia-contracts";
import { dirname } from "node:path";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
    LocalArtifactFiles,
    LocalContractReleases,
    LocalProviderReleases,
    withRepositoryWriteLock,
} from "@bernouy/repository/repository/filesystem";

type BootstrapIndex = Readonly<{
    contracts: readonly string[];
    provider: string;
}>;

/** Admits pre-built official releases without reading authored source folders at runtime. */
export async function bootstrapOfficialRepository(
    repositoryRoot: string,
    root = resolve(import.meta.dir, "../../dist/bootstrap"),
): Promise<void> {
    const index = parseBootstrapIndex(JSON.parse(await readFile(join(root, "index.json"), "utf8")));
    await withRepositoryWriteLock(repositoryRoot, async () => {
        const files = new LocalArtifactFiles(repositoryRoot);
        const contracts = new LocalContractReleases(files);
        for (const path of index.contracts) {
            const source = await readFile(join(root, path), "utf8");
            const metadata = parseContractReleaseJson(source);
            const assets = await Promise.all(
                (metadata.documentation ?? []).map(async (document) => ({
                    id: `docs/${document.path}`,
                    bytes: await readFile(join(root, dirname(path), "docs", document.path)),
                })),
            );
            await contracts.publish(source, assets);
        }
        await new LocalProviderReleases(files, contracts).release(await readFile(join(root, index.provider), "utf8"));
    });
}

function parseBootstrapIndex(value: unknown): BootstrapIndex {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Official bootstrap index must be an object");
    }
    const index = value as Record<string, unknown>;
    const contracts = index.contracts;
    const keys = Object.keys(index).toSorted();
    if (
        keys.join(",") !== "contracts,provider" ||
        !Array.isArray(contracts) ||
        contracts.length === 0 ||
        contracts.length > 128 ||
        contracts.some(
            (path) => typeof path !== "string" || !/^contracts\/(?:cms\/)?[a-z0-9.-]+\/definition\.json$/u.test(path),
        ) ||
        new Set(contracts).size !== contracts.length ||
        index.provider !== "providers/primary-provider/definition.json"
    ) {
        throw new Error("Official bootstrap index is invalid");
    }
    return {
        contracts,
        provider: index.provider,
    } as BootstrapIndex;
}
