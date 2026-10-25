import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { withRepositoryWriteLock } from "@bernouy/cms-repository/repository/filesystem";
import { loadOrCreateRepositoryToken } from "../../config";
import { assertLocalInstanceName, type UlviaPaths } from "../../paths";
import { composeStop, composeUp, inspectComposeServices, type ComposeProject } from "../orchestration/compose";
import { ensureOfficialImage, pinnedOfficialImageReference, pullOfficialImage } from "../orchestration/images";
import { DEFAULT_STACK_VERSION } from "../version";
import { readRepositoryState, saveRepositoryState, type StandaloneRepositoryState } from "./state";

export async function repositoryLifecycle(
    paths: UlviaPaths,
    name: string,
    action: "start" | "stop" | "status" | "upgrade",
    options: { version?: string; port?: number },
    log: (message: string) => void,
): Promise<void> {
    assertLocalInstanceName(name);
    const root = join(paths.data, "repositories", name);
    await withRepositoryWriteLock(root, async () => {
        const installed = await readRepositoryState(root);
        if (action === "status" && !installed) {
            log(`Repository ${name}: not initialized`);
            return;
        }
        if (!installed && action !== "start") {
            throw new Error("Standalone Repository is not initialized");
        }
        if (
            action === "start" &&
            installed &&
            ((options.version && options.version !== installed.image.version) ||
                (options.port && options.port !== installed.port))
        ) {
            throw new Error("Repository is already configured; use repository upgrade to change its image");
        }
        const image =
            action === "upgrade" || !installed
                ? await pullOfficialImage("repository", options.version ?? DEFAULT_STACK_VERSION, log)
                : installed.image;
        const state: StandaloneRepositoryState = {
            schema: "ulvia.repository-service.v1",
            image,
            port: options.port ?? installed?.port ?? 5010,
        };
        const project = await repositoryProject(root, state);
        if (action === "status") {
            const services = await inspectComposeServices(project);
            const service = services.find((item) => item.service === "repository");
            log(`Repository ${name}: ${service?.state ?? "stopped"}${service?.health ? ` / ${service.health}` : ""}`);
            log(`Version: ${state.image.version} (${state.image.digest})`);
            log(`Endpoint: http://127.0.0.1:${state.port}`);
            return;
        }
        if (action === "stop") {
            await composeStop(project);
            log(`Repository ${name} stopped. Persistent data retained.`);
            return;
        }
        await ensureOfficialImage(state.image);
        if (!installed) {
            await saveRepositoryState(root, state);
        }
        try {
            await composeUp(project);
            await saveRepositoryState(root, state);
        } catch (error) {
            if (installed && action === "upgrade") {
                await composeUp(await repositoryProject(root, installed)).catch(() => undefined);
            }
            throw error;
        }
        log(`Repository ${name} ready at http://127.0.0.1:${state.port} (${state.image.version}).`);
    });
}

async function repositoryProject(root: string, state: StandaloneRepositoryState): Promise<ComposeProject> {
    await mkdir(join(root, "data"), { recursive: true, mode: 0o700 });
    const token = await loadOrCreateRepositoryToken(root);
    return {
        definition: "repository",
        projectName: `ulvia-repository-${createHash("sha256").update(root).digest("hex").slice(0, 12)}`,
        environment: {
            OFFICIAL_REPOSITORY_IMAGE: pinnedOfficialImageReference(state.image),
            ULVIA_REPOSITORY_DIR: join(root, "data"),
            ULVIA_REPOSITORY_PORT: String(state.port),
            ULVIA_REPOSITORY_TOKEN: token,
            ULVIA_UID: String(process.getuid?.() ?? 1000),
            ULVIA_GID: String(process.getgid?.() ?? 1000),
        },
    };
}
