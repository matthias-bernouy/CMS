import { assertImageVersion } from "../../../runtime/stack/orchestration/images";
import { isAbsolute } from "node:path";
export function upgradeOptions(args: readonly string[]) {
    let version: string | undefined,
        backupDirectory: string | undefined,
        plan = false;
    const seen = new Set<string>();
    for (let i = 0; i < args.length; i++) {
        const key = args[i]!;
        if (seen.has(key)) {
            throw new Error("Duplicate upgrade option");
        }
        seen.add(key);
        if (key === "--plan") {
            plan = true;
            continue;
        }
        if (!["--version", "--backup-directory"].includes(key) || !args[i + 1] || args[i + 1]!.startsWith("--")) {
            throw new Error(
                "Usage: ulvia upgrade [--version VERSION] [--plan] [--backup-directory NEW-ABSOLUTE-DIRECTORY]",
            );
        }
        const value = args[++i]!;
        if (key === "--version") {
            assertImageVersion(value);
            version = value;
        } else {
            if (!isAbsolute(value)) {
                throw new Error("Backup directory must be absolute");
            }
            backupDirectory = value;
        }
    }
    return { version, plan, backupDirectory };
}
