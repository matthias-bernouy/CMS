import { resolve } from "node:path";
import {
    ensureUlviaPaths,
    ensureLocalInstancePaths,
    resolveUlviaPaths,
    resolveLocalInstancePaths,
} from "../../../src/runtime/paths";
import { runCommand } from "../../../src/runtime/process";
import { loadOrCreateInstallationConfig } from "../../../src/runtime/stack/installation";
import {
    assertImageVersion,
    officialImageReference,
    parseOfficialImageInspection,
    type OfficialImageComponent,
} from "../../../src/runtime/stack/orchestration/images";
import {
    saveLocalServicesState,
    saveLocalEdgeState,
    localEdgeProjectName,
} from "../../../src/runtime/stack/orchestration/state";

/** Seed only verified image pins; all credentials, databases and CMS data start empty. */
export async function prepareSmokeRuntimeImages(environment: Record<string, string | undefined>) {
    const root = resolve(import.meta.dir, "../../../../../..");
    const prebuilt = environment.ULVIA_SMOKE_IMAGE_VERSION?.trim();
    const version = prebuilt || "0.1.0-edge-smoke";
    assertImageVersion(version);
    if (!prebuilt) {
        await runCommand([process.execPath, "run", "infra/images/build.ts", "build", "--version", version, "all"], {
            cwd: root,
            inherit: true,
        });
    }
    const inspect = async (component: OfficialImageComponent) => {
        const reference = officialImageReference(component, version);
        const metadata = await runCommand(["docker", "image", "inspect", reference]);
        return parseOfficialImageInspection(metadata.stdout, component, version);
    };
    const [provider, repository, edge] = await Promise.all([
        inspect("provider"),
        inspect("repository"),
        inspect("edge"),
    ]);
    const paths = resolveUlviaPaths(environment);
    await ensureUlviaPaths(paths);
    const installation = await loadOrCreateInstallationConfig(paths, environment);
    await saveLocalServicesState(paths, installation, { provider, repository });
    const instance = resolveLocalInstancePaths(paths, "default");
    await ensureLocalInstancePaths(instance);
    await saveLocalEdgeState(instance, localEdgeProjectName(paths, "default"), "localhost", edge);
    return version;
}
