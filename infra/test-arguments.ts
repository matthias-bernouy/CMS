const DEFAULT_PATHS = ["./quality", "./tests", "./packages"];
const VALUE_OPTIONS = new Set([
    "--timeout",
    "--rerun-each",
    "--retry",
    "--seed",
    "--coverage-reporter",
    "--coverage-dir",
    "-t",
    "--test-name-pattern",
    "--reporter",
    "--reporter-outfile",
    "--max-concurrency",
    "--path-ignore-patterns",
    "--changed",
    "--parallel-delay",
    "--shard",
    "--timings",
    "--preload",
    "--env-file",
    "--config",
    "-c",
]);

/** Flags alone keep discovery inside maintained source trees; explicit targets remain focused. */
export function testArguments(args: readonly string[]): string[] {
    for (let index = 0; index < args.length; index++) {
        const argument = args[index]!;
        if (!argument.startsWith("-")) {
            return [...args];
        }
        if (VALUE_OPTIONS.has(argument)) {
            index++;
        } else if (["--bail", "--parallel"].includes(argument) && /^\d+$/u.test(args[index + 1] ?? "")) {
            index++;
        }
    }
    return [...DEFAULT_PATHS, ...args];
}
