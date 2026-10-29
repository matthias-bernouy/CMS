async function git(root: string, args: string[]): Promise<string> {
    const process = Bun.spawn(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
    const [code, stdout, stderr] = await Promise.all([
        process.exited,
        new Response(process.stdout).text(),
        new Response(process.stderr).text(),
    ]);
    if (code) {
        throw new Error(`Cannot determine changed files: ${stderr.trim()}`);
    }
    return stdout;
}
export async function changedFiles(root: string, base?: string): Promise<string[]> {
    let reference = "HEAD";
    if (base) {
        try {
            reference = (await git(root, ["merge-base", "HEAD", base])).trim();
        } catch {
            // A force-push can remove the advertised base even with complete current history.
            // Treat every tracked path as changed; never silently narrow the review to HEAD^.
            const [tracked, deleted, untracked] = await Promise.all([
                git(root, ["ls-files", "-z"]),
                git(root, ["diff", "--name-only", "--no-renames", "-z", "HEAD", "--"]),
                git(root, ["ls-files", "--others", "--exclude-standard", "-z"]),
            ]);
            return [
                ...new Set([tracked, deleted, untracked].flatMap((value) => value.split("\0")).filter(Boolean)),
            ].sort();
        }
    }
    const [tracked, untracked] = await Promise.all([
        git(root, ["diff", "--name-only", "--no-renames", "-z", reference, "--"]),
        git(root, ["ls-files", "--others", "--exclude-standard", "-z"]),
    ]);
    return [...new Set([...tracked.split("\0"), ...untracked.split("\0")].filter(Boolean))].sort();
}
export function parseOptions(args: readonly string[]): { verbose: boolean; base?: string } {
    let verbose = false;
    let base: string | undefined;
    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (arg === "--verbose") {
            verbose = true;
        } else if (arg === "--base" && !base && args[index + 1] && !args[index + 1]!.startsWith("-")) {
            base = args[++index];
        } else {
            throw new Error("Usage: bun run check:all [--verbose] [--base <ref>]");
        }
    }
    return { verbose, ...(base ? { base } : {}) };
}
