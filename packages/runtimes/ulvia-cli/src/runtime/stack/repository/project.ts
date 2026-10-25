import { createHash } from "node:crypto";
import { join } from "node:path";
import { privateDirectory } from "../../repository/config";
import type { ComposeProject } from "../orchestration/compose";
import { pinnedOfficialImageReference } from "../orchestration/images";
import type { StandaloneRepositoryState } from "./state";

export async function repositoryProject(root: string, state: StandaloneRepositoryState): Promise<ComposeProject> {
    await privateDirectory(join(root, "data"));
    const config = state.config;
    const acme = config.tls.mode === "acme";
    if (acme) {
        for (const directory of ["certificates", "virtual-hosts", "challenge", "acme"]) {
            await privateDirectory(join(root, "proxy", directory));
        }
    }
    return {
        definition: "repository",
        overlays: acme ? ["repository-tls"] : [],
        projectName: `ulvia-repository-${createHash("sha256").update(root).digest("hex").slice(0, 12)}`,
        environment: {
            OFFICIAL_REPOSITORY_IMAGE: pinnedOfficialImageReference(state.image),
            ULVIA_REPOSITORY_DIR: join(root, "data"),
            ULVIA_REPOSITORY_PORT: String(state.config.port),
            ULVIA_REPOSITORY_PUBLIC_URL: config.publicUrl,
            ULVIA_REPOSITORY_DOMAIN: new URL(config.publicUrl).hostname,
            ULVIA_REPOSITORY_PROXY_DIR: join(root, "proxy"),
            ULVIA_ACME_EMAIL: config.tls.mode === "acme" ? config.tls.email : "disabled@example.invalid",
            ULVIA_UID: String(process.getuid?.() ?? 1000),
            ULVIA_GID: String(process.getgid?.() ?? 1000),
        },
    };
}
