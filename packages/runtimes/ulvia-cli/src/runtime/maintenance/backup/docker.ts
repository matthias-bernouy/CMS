import { localServicesIdentity } from "../../stack/orchestration/state";
import { backupTree } from "./tree";
import { runCommand } from "../../process";
import type { UlviaPaths } from "../../paths";
export async function treeInContainer(
    mode: "create" | "verify" | "restore",
    paths: UlviaPaths,
    backup: string,
    image: string,
) {
    for (const path of [paths.data, backup]) {
        if (!path.startsWith("/") || /[\r\n,]/u.test(path)) {
            throw new Error("Backup mount paths must be absolute and contain no commas or newlines");
        }
    }
    const input = {
        mode,
        data: "/data",
        backup: "/backup",
        uid: process.getuid?.() ?? 1000,
        gid: process.getgid?.() ?? 1000,
    };
    const result = await runCommand([
        "docker",
        "run",
        "--rm",
        "--label",
        `com.docker.compose.project=${localServicesIdentity(paths).projectName}`,
        "--label",
        "io.ulvia.maintenance-helper=1",
        "--network",
        "none",
        "--read-only",
        "--user",
        "0:0",
        "--cap-drop",
        "ALL",
        "--cap-add",
        "DAC_OVERRIDE",
        "--cap-add",
        "CHOWN",
        "--cap-add",
        "FOWNER",
        "--security-opt",
        "no-new-privileges:true",
        "--mount",
        `type=bind,src=${paths.data},dst=/data${mode === "restore" ? "" : ",readonly"}`,
        "--mount",
        `type=bind,src=${backup},dst=/backup${mode === "create" ? "" : ",readonly"}`,
        "--entrypoint",
        "bun",
        image,
        "--no-macros",
        "-e",
        `const run=${backupTree.toString()};try{console.log(JSON.stringify(await run(JSON.parse(process.argv[1]))));}catch{console.error("Backup tree operation failed; the snapshot is incomplete or invalid");process.exit(1);}`,
        JSON.stringify(input),
    ]);
    const value = JSON.parse(result.stdout);
    if (
        !value ||
        !/^[a-f0-9]{64}$/u.test(value.treeDigest) ||
        ![value.bytes, value.files].every((n) => Number.isSafeInteger(n) && n >= 0)
    ) {
        throw new Error("Invalid backup worker result");
    }
    return value as { treeDigest: string; bytes: number; files: number };
}
