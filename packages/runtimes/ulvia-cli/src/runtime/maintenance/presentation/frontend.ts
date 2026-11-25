import { createHash } from "node:crypto";
import { runCommand } from "../../process";
import { localServicesIdentity } from "../../stack/orchestration/state";
import { readPrivateFile } from "../../stack/orchestration/deployment/storage";
import { presentationDirectory } from "./model";
import type { UlviaPaths } from "../../paths";
import type { LocalServicesState } from "../../stack/orchestration/state";
const name = (paths: UlviaPaths) => `${localServicesIdentity(paths).projectName}-maintenance`;
export function frontendImage(state: LocalServicesState) {
    const image = state.release.files["services.yml"].match(/image: (caddy:[^\s]+@sha256:[a-f0-9]{64})/u)?.[1];
    if (!image) {
        throw new Error("The applied release has no pinned Caddy image");
    }
    return image;
}
export function frontendArguments(directory: string) {
    if (!directory.startsWith("/") || /[\r\n,]/u.test(directory)) {
        throw new Error("Invalid maintenance frontend mount path");
    }
    return [
        "--read-only",
        "--user",
        `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges:true",
        "--tmpfs",
        "/tmp:rw,nosuid,nodev,noexec,size=32m",
        "--env",
        "XDG_DATA_HOME=/tmp/data",
        "--env",
        "XDG_CONFIG_HOME=/tmp/config",
        "--mount",
        `type=bind,src=${directory},dst=/snapshot,readonly`,
    ];
}
export async function stopPresentation(paths: UlviaPaths) {
    const found = await runCommand(["docker", "container", "inspect", name(paths)], { allowFailure: true });
    if (found.exitCode !== 0) {
        return;
    }
    const row = JSON.parse(found.stdout)[0];
    if (row?.Config?.Labels?.["io.ulvia.maintenance-front"] !== localServicesIdentity(paths).projectName) {
        throw new Error("Maintenance frontend ownership does not match");
    }
    await runCommand(["docker", "rm", "--force", row.Id]);
}
export async function startPresentation(paths: UlviaPaths, backup: string, state: LocalServicesState) {
    const directory = presentationDirectory(backup);
    if (!(await readPrivateFile(`${directory}/ready.json`))) {
        return;
    }
    const existing = await runCommand(["docker", "container", "inspect", name(paths)], { allowFailure: true });
    const identity = createHash("sha256").update(directory).digest("hex");
    if (existing.exitCode === 0) {
        const row = JSON.parse(existing.stdout)[0];
        if (
            row?.Config?.Labels?.["io.ulvia.maintenance-front"] !== state.projectName ||
            row.Config.Labels["io.ulvia.maintenance-snapshot"] !== identity
        ) {
            throw new Error("A different maintenance frontend is already present");
        }
        if (!row.State.Running) {
            await runCommand(["docker", "start", row.Id]);
        }
    } else {
        const normal = await runCommand([
            "docker",
            "ps",
            "--filter",
            `label=com.docker.compose.project=${state.projectName}`,
            "--filter",
            "label=com.docker.compose.service=proxy",
            "--format",
            "{{.ID}}",
        ]);
        if (normal.stdout.trim()) {
            return;
        }
        const { installation } = state;
        await runCommand([
            "docker",
            "run",
            "--detach",
            "--restart",
            "unless-stopped",
            "--name",
            name(paths),
            "--label",
            `io.ulvia.maintenance-front=${state.projectName}`,
            "--label",
            `io.ulvia.maintenance-snapshot=${identity}`,
            ...frontendArguments(directory),
            "--publish",
            `${installation.bindAddress}:${installation.ports.http}:80`,
            ...(installation.tls.mode === "acme"
                ? ["--publish", `${installation.bindAddress}:${installation.tls.httpsPort}:443`]
                : []),
            frontendImage(state),
            "caddy",
            "run",
            "--config",
            "/snapshot/caddy.json",
        ]);
    }
    const { installation } = state;
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`http://127.0.0.1:${installation.ports.http}/`, {
                signal: AbortSignal.timeout(1000),
            });
            await response.body?.cancel();
            if (response.status === 503 && response.headers.get("ulvia-maintenance") === "upgrade") {
                return;
            }
        } catch {
            /* Wait for the static listener only. */
        }
        await Bun.sleep(100);
    }
    throw new Error("Maintenance frontend did not become ready");
}
