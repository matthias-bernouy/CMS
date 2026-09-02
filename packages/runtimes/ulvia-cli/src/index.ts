import { runCli } from "./cli";

export { runCli, type CliOptions } from "./cli";
export { resolveUlviaPaths, type UlviaPaths } from "./runtime/paths";

if (import.meta.main) {
    try {
        await runCli(process.argv.slice(2));
    } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    }
}
