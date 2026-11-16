export type CommandOptions = {
    cwd?: string;
    capture?: boolean;
    env?: Record<string, string | undefined>;
};

export async function command(args: readonly string[], options: CommandOptions = {}): Promise<string> {
    const child = Bun.spawn([...args], {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        stdin: options.capture ? "ignore" : "inherit",
        stdout: options.capture ? "pipe" : "inherit",
        stderr: "inherit",
    });
    const [code, output] = await Promise.all([
        child.exited,
        options.capture ? new Response(child.stdout).text() : Promise.resolve(""),
    ]);
    if (code !== 0) {
        throw new Error(`${args.join(" ")} exited with ${code}`);
    }
    return output;
}
