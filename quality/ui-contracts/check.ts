import { resolve } from "node:path";
import { auditUiContracts, hasErrors } from "./audit";
import { formatMarkdown, formatText } from "./report/format";

export function parseArgs(args: readonly string[]): { root: string; format: "text" | "json" | "markdown" } {
    let root = resolve(import.meta.dir, "../..");
    let format: "text" | "json" | "markdown" = "text";
    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (arg === "--root" && args[index + 1] && !args[index + 1]!.startsWith("--")) {
            root = resolve(args[++index]!);
        } else if (arg === "--json") {
            format = "json";
        } else if (arg === "--markdown") {
            format = "markdown";
        } else {
            throw new Error(`Unknown or incomplete option: ${arg}`);
        }
    }
    return { root, format };
}

export async function runUiContracts(args = process.argv.slice(2)): Promise<number> {
    const { root, format } = parseArgs(args);
    const audit = await auditUiContracts(root);
    console.log(
        format === "json"
            ? JSON.stringify(audit, null, 2)
            : format === "markdown"
              ? formatMarkdown(audit)
              : formatText(audit),
    );
    return hasErrors(audit.findings) ? 1 : 0;
}

if (import.meta.main) {
    try {
        process.exitCode = await runUiContracts();
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 2;
    }
}
