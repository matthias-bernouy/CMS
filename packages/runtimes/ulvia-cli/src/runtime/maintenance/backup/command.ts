import { isAbsolute } from "node:path";
import type { UlviaPaths } from "../../paths";
import { createInstallationBackup, restoreInstallationBackup } from "./operations";
import { verifySnapshot } from "./snapshot";
export async function backupCommand(args: readonly string[], paths: UlviaPaths, log: (message: string) => void) {
    const usage =
        "Usage: ulvia backup <create|verify> <absolute-directory>, or ulvia backup restore <absolute-directory> --yes";
    if (args.length === 1 && ["--help", "-h"].includes(args[0]!)) {
        log(usage);
        return;
    }
    const [action, directory, ...rest] = args;
    if (
        !directory ||
        !isAbsolute(directory) ||
        !["create", "verify", "restore"].includes(action ?? "") ||
        (action === "restore" ? rest.length !== 1 || rest[0] !== "--yes" : rest.length !== 0)
    ) {
        throw new Error(usage);
    }
    if (action === "create") {
        await createInstallationBackup(paths, directory, log);
    } else if (action === "verify") {
        const value = await verifySnapshot(paths, directory);
        log(
            `Verified backup of stack ${value.state.release.version}: ${value.record.files} files, ${value.record.bytes} bytes.`,
        );
    } else {
        await restoreInstallationBackup(paths, directory, log);
    }
}
