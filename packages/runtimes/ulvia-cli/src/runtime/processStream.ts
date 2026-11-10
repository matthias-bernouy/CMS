/** Stream complete bounded lines, with shared cancellation and no unbounded output accumulation. */
export async function streamCommand(
    command: readonly string[],
    environment: Record<string, string | undefined>,
    line: (text: string) => void,
    signal: AbortSignal,
): Promise<void> {
    const child = Bun.spawn([...command], { env: environment, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    let force: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
        child.kill("SIGTERM");
        force ??= setTimeout(() => child.kill("SIGKILL"), 1000);
    };
    signal.addEventListener("abort", stop, { once: true });
    if (signal.aborted) {
        stop();
    }
    const read = async (stream: ReadableStream<Uint8Array>) => {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let pending = "";
        try {
            for (;;) {
                const chunk = await reader.read();
                if (chunk.done) {
                    break;
                }
                pending += decoder.decode(chunk.value, { stream: true });
                let newline: number;
                while ((newline = pending.indexOf("\n")) >= 0) {
                    if (Buffer.byteLength(pending.slice(0, newline)) > 65_536) {
                        throw new Error("Runtime log line exceeds 64 KiB");
                    }
                    line(pending.slice(0, newline).replace(/\r$/u, ""));
                    pending = pending.slice(newline + 1);
                }
                if (Buffer.byteLength(pending) > 65_536) {
                    throw new Error("Runtime log line exceeds 64 KiB");
                }
            }
            pending += decoder.decode();
            if (Buffer.byteLength(pending) > 65_536) {
                throw new Error("Runtime log line exceeds 64 KiB");
            }
            if (pending) {
                line(pending);
            }
        } catch (error) {
            stop();
            throw error;
        } finally {
            await reader.cancel().catch(() => undefined);
            reader.releaseLock();
        }
    };
    try {
        const results = await Promise.allSettled([read(child.stdout), read(child.stderr)]);
        const failure = results.find((value) => value.status === "rejected");
        if (failure?.status === "rejected") {
            stop();
            await child.exited;
            throw failure.reason;
        }
        const code = await child.exited;
        if (code !== 0 && !signal.aborted) {
            throw new Error(`Runtime log command failed (${code})`);
        }
    } finally {
        signal.removeEventListener("abort", stop);
        if (force) {
            clearTimeout(force);
        }
        if (child.exitCode === null) {
            child.kill("SIGKILL");
            await child.exited;
        }
    }
}
