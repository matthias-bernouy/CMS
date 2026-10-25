import { resolve } from "node:path";
import {
    withRepositoryWriteLock,
    LocalArtifactFiles,
    LocalContractReleases,
    LocalRepositoryYanks,
} from "@bernouy/cms-repository/repository/filesystem";
import { releaseBatch } from "./batch";
import { discoverResources } from "./discovery";
import { prepareResource, storeResource } from "./resource";

const HELP = `Usage: ulvia release <resource-directory> [--recursive]

Prepare immutable releases in the local cache. --recursive discovers authored
resource roots and orders contracts before provider manifests and collections.
Use push separately to publish an exact coordinate to a remote Repository.`;

export async function releaseCommand(
    args: readonly string[],
    cwd: string,
    repositoryRoot: string,
    log: (message: string) => void,
): Promise<void> {
    if (args.length === 1 && ["--help", "-h"].includes(args[0]!)) {
        log(HELP);
        return;
    }
    const recursive = args.includes("--recursive");
    const directories = args.filter((argument) => argument !== "--recursive");
    if (directories.length !== 1 || directories[0]!.startsWith("-") || args.length !== (recursive ? 2 : 1)) {
        throw new Error(HELP);
    }
    const directory = resolve(cwd, directories[0]!);
    // Discover before taking the cache lock; discovery never mutates the Repository.
    const resources = recursive ? await discoverResources(directory) : undefined;
    await withRepositoryWriteLock(repositoryRoot, async () => {
        if (resources) {
            await releaseBatch(resources, repositoryRoot, log);
            return;
        }
        const files = new LocalArtifactFiles(repositoryRoot);
        const contracts = new LocalContractReleases(files, new LocalRepositoryYanks(repositoryRoot));
        await storeResource(await prepareResource(directory, await contracts.catalogue()), repositoryRoot, log);
    });
}
