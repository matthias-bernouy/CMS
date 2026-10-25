import { repositoryProject } from "./project";
import { defaultRepositoryConfig, readRepositoryConfig, saveRepositoryConfig } from "./config";
import { join } from "node:path";
import { withRepositoryWriteLock } from "@bernouy/cms-repository/repository/filesystem";
import { type UlviaPaths } from "../../paths";
import { composeStop, composeUp, inspectComposeServices } from "../orchestration/compose";
import { ensureOfficialImage, pullOfficialImage } from "../orchestration/images";
import { defaultStackVersion } from "../version";
import { readRepositoryState, saveRepositoryState, type StandaloneRepositoryState } from "./state";

export async function repositoryLifecycle(
    paths: UlviaPaths,
    action: "start" | "stop" | "status" | "upgrade",
    options: { version?: string; port?: number },
    log: (message: string) => void,
): Promise<void> {
    const root = join(paths.data, "repository-service");
    await withRepositoryWriteLock(root, async () => {
        const installed = await readRepositoryState(root);
        if (action === "status" && !installed) {
            log(`Repository: not initialized`);
            return;
        }
        if (!installed && action !== "start") {
            throw new Error("Standalone Repository is not initialized");
        }
        if (
            action === "start" &&
            installed &&
            ((options.version && options.version !== installed.image.version) ||
                (options.port && options.port !== installed.config.port))
        ) {
            throw new Error("Repository is already configured; use repository upgrade to change its image");
        }
        if ((action === "status" || action === "stop") && installed) {
            const project = await repositoryProject(root, installed);
            if (action === "stop") {
                await composeStop(project);
                log("Repository stopped. Persistent data retained.");
            } else {
                const services = await inspectComposeServices(project);
                const service = services.find((item) => item.service === "repository");
                log(`Repository: ${service?.state ?? "stopped"}${service?.health ? ` / ${service.health}` : ""}`);
                log(`Version: ${installed.image.version} (${installed.image.digest})`);
                log(`Endpoint: ${installed.config.publicUrl}`);
                log(`Configuration: ${join(root, "config.json")}`);
            }
            return;
        }
        const desired = await readRepositoryConfig(
            root,
            defaultRepositoryConfig(options.port ?? installed?.config.port ?? 5010),
        );
        if (options.port && options.port !== desired.port) {
            throw new Error("Use repository configure --port before starting");
        }
        const image =
            action === "upgrade" || !installed
                ? await pullOfficialImage("repository", options.version ?? defaultStackVersion(), log)
                : installed.image;
        const state: StandaloneRepositoryState = {
            schema: "ulvia.repository-service.v2",
            image,
            config: desired,
        };
        const project = await repositoryProject(root, state);
        await saveRepositoryConfig(root, desired);
        await ensureOfficialImage(state.image);
        if (!installed) {
            await saveRepositoryState(root, state);
        }
        try {
            await composeUp(project, true);
            await saveRepositoryState(root, state);
        } catch (error) {
            if (installed) {
                await composeUp(await repositoryProject(root, installed), true).catch(() => undefined);
            }
            throw error;
        }
        log(`Repository ready at ${desired.publicUrl} (${state.image.version}).`);
    });
}
