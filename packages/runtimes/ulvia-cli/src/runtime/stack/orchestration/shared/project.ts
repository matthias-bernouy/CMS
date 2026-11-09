import { join } from "node:path";
import { opendir } from "node:fs/promises";
import { loadOrCreateLocalServicesConfig, loadOrCreateProviderOperatorToken } from "../../../config";
import type { UlviaPaths } from "../../../paths";
import type { LocalServicesState } from "../state";
import type { ComposeProject } from "../compose";
import { localServicesEnvironment } from "../environment";

/** Launch intent precedes Docker: storage without pins cannot be an interrupted fresh launch. */
export async function assertUnpinnedStorageIsEmpty(paths: UlviaPaths): Promise<void> {
    for (const path of [paths.mongo, paths.cmsFiles]) {
        const directory = await opendir(path);
        try {
            if (await directory.read()) {
                throw new Error(
                    "Shared launch state is missing over persistent storage; explicit operator recovery is required",
                );
            }
        } finally {
            await directory.close();
        }
    }
}

export async function serviceCredentials(paths: UlviaPaths) {
    return {
        config: await loadOrCreateLocalServicesConfig(paths.services),
        operatorToken: await loadOrCreateProviderOperatorToken(paths.services),
    };
}
export function serviceProject(
    paths: UlviaPaths,
    state: LocalServicesState,
    credentials?: Awaited<ReturnType<typeof serviceCredentials>>,
): ComposeProject {
    return {
        definition: "services",
        overlays: state.installation.tls.mode === "acme" ? ["services-tls"] : [],
        generatedFile: join(paths.services, "shared-edges.json"),
        projectName: state.projectName,
        environment: localServicesEnvironment(paths, state.installation, state, credentials),
    };
}
