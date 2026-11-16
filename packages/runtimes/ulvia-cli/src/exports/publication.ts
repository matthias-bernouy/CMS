import { LocalCollectionRepository } from "@bernouy/repository/repository/filesystem";
import { allLocalCoordinates } from "../commands/remote/plan";
import { preparePush } from "../commands/remote/push";
import { clientConfigDirectory, readClientConfig } from "../runtime/repository/config";

/** Inspect an isolated build catalogue without using the personal release cache. */
export function listPreparedReleases(root: string) {
    return allLocalCoordinates(root, new LocalCollectionRepository(root));
}

/** Use the saved publisher connection, while selecting only the supplied build catalogue. */
export async function prepareReleasePublication(root: string, environment: Record<string, string | undefined>) {
    const directory = clientConfigDirectory(environment);
    const url = environment.ULVIA_REPOSITORY_URL?.trim() || (await readClientConfig(directory)).repository?.url;
    if (!url) {
        throw new Error("No Repository selected. Run ulvia repository login <url> first.");
    }
    return preparePush({ mode: "all" }, url, root, { ...environment, ULVIA_CONFIG_DIR: directory });
}
