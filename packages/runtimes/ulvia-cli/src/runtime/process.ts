export type CommandResult = Readonly<{
    exitCode: number;
    stdout: string;
    stderr: string;
}>;

export type RunCommandOptions = Readonly<{
    cwd?: string;
    inherit?: boolean;
    allowFailure?: boolean;
}>;

export async function runCommand(command: readonly string[], options: RunCommandOptions = {}): Promise<CommandResult> {
    const inherit = options.inherit ?? false;
    const subprocess = Bun.spawn([...command], {
        ...(options.cwd ? { cwd: options.cwd } : {}),
        stdin: inherit ? "inherit" : "ignore",
        stdout: inherit ? "inherit" : "pipe",
        stderr: inherit ? "inherit" : "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
        subprocess.exited,
        inherit ? Promise.resolve("") : readStream(subprocess.stdout),
        inherit ? Promise.resolve("") : readStream(subprocess.stderr),
    ]);
    if (exitCode !== 0 && !options.allowFailure) {
        const detail = stderr.trim() || stdout.trim();
        throw new Error(`Command failed (${command[0]}${detail ? `): ${detail}` : ")"}`);
    }
    return { exitCode, stdout, stderr };
}

export function requireExecutable(name: string): void {
    if (!Bun.which(name)) {
        throw new Error(`${name} is required but was not found in PATH`);
    }
}

async function readStream(stream: ReadableStream<Uint8Array> | number | undefined): Promise<string> {
    if (!stream || typeof stream === "number") {
        return "";
    }
    return await new Response(stream).text();
}
