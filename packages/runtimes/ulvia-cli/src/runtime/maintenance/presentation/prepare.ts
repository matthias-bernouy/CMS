import { MAINTENANCE_HTML } from "@bernouy/content/public-delivery";
import { mkdir, open, readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { composeWorker } from "../../stack/orchestration/compose";
import { deploymentProject } from "../../stack/orchestration/deployment/artifacts";
import { atomicPrivateWrite } from "../../stack/orchestration/deployment/storage";
import { runCommand } from "../../process";
import { copyPresentationCertificates } from "./certificates";
import { maintenanceConfiguration } from "./configuration";
import { frontendArguments, frontendImage } from "./frontend";
import { readPages, presentationDirectory } from "./model";
import type { UlviaPaths } from "../../paths";
import type { LocalServicesState } from "../../stack/orchestration/state";
export async function preparePresentation(
    paths: UlviaPaths,
    backup: string,
    applied: LocalServicesState,
    target: LocalServicesState,
) {
    const directory = presentationDirectory(backup);
    if (/[\r\n:,]/u.test(directory)) {
        throw new Error("Unsupported maintenance snapshot mount path");
    }
    await mkdir(directory, { mode: 0o700 });
    await composeWorker(await deploymentProject(paths, target), [
        "run",
        "--rm",
        "--no-deps",
        "--volume",
        `${directory}:/presentation:rw`,
        "--entrypoint",
        "bun",
        "provider",
        "--no-macros",
        "run",
        "packages/runtimes/ulvia-provider-server/src/maintenance/presentation/index.ts",
        "/presentation",
    ]);
    const pages = await readPages(directory);
    const defaultSites = new Set<string>();
    for (const site of pages.sites) {
        if ((await readFile(join(directory, "sites", site.id, "page.html"), "utf8")) === MAINTENANCE_HTML) {
            defaultSites.add(site.id);
        }
    }
    const certificates = await copyPresentationCertificates(
        paths.proxy.certificates,
        join(directory, "certificates"),
        pages.tlsHosts,
    );
    await atomicPrivateWrite(
        join(directory, "caddy.json"),
        JSON.stringify(maintenanceConfiguration(pages, certificates, defaultSites)),
    );
    await runCommand([
        "docker",
        "run",
        "--rm",
        "--network",
        "none",
        "--label",
        `com.docker.compose.project=${applied.projectName}`,
        ...frontendArguments(directory),
        frontendImage(applied),
        "caddy",
        "validate",
        "--config",
        "/snapshot/caddy.json",
    ]);
    // Flush the complete directory tree before publishing the frontend readiness marker.
    const roots = [
        directory,
        join(directory, "sites"),
        ...pages.sites.map((site) => join(directory, "sites", site.id)),
        ...(certificates ? [join(directory, "certificates")] : []),
    ];
    for (const root of roots) {
        const handle = await open(root, "r");
        try {
            await handle.sync();
        } finally {
            await handle.close();
        }
    }
    await atomicPrivateWrite(
        join(directory, "ready.json"),
        JSON.stringify({ schema: "ulvia.maintenance-front/v1", id: randomUUID() }),
    );
}
