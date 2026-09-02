import { spawnCommand } from "../process";
import { SUPABASE_CLI_VERSION } from "../supabase";

const READY_MARKER = "Serving functions on ";

export type LocalSupabaseFunctionsRuntime = Readonly<{
    reload(): Promise<void>;
    stop(): Promise<void>;
}>;

export class SupabaseCliFunctionsRuntime implements LocalSupabaseFunctionsRuntime {
    private subprocess?: ReturnType<typeof spawnCommand>;
    private draining?: Promise<void>;
    private queue: Promise<void> = Promise.resolve();

    constructor(private readonly projectRoot: string) {}

    reload(): Promise<void> {
        return this.enqueue(async () => await this.restart());
    }

    stop(): Promise<void> {
        return this.enqueue(async () => await this.stopCurrent());
    }

    private enqueue(operation: () => Promise<void>): Promise<void> {
        const pending = this.queue.then(operation);
        this.queue = pending.catch(() => undefined);
        return pending;
    }

    private async restart(): Promise<void> {
        await this.stopCurrent();
        const subprocess = spawnCommand([
            "bunx",
            `supabase@${SUPABASE_CLI_VERSION}`,
            "--workdir",
            this.projectRoot,
            "--yes",
            "functions",
            "serve",
        ]);
        this.subprocess = subprocess;
        const ready = Promise.withResolvers<void>();
        let isReady = false;
        let outputTail = "";
        const inspect = (output: string) => {
            outputTail = `${outputTail}${output}`.slice(-256);
            if (!isReady && outputTail.includes(READY_MARKER)) {
                isReady = true;
                ready.resolve();
            }
        };
        this.draining = Promise.all([
            drainOutput(subprocess.stdout, inspect),
            drainOutput(subprocess.stderr, inspect),
        ]).then(() => undefined);
        const exitedBeforeReady = subprocess.exited.then(() => {
            if (!isReady) {
                throw new Error("Local Supabase Edge Functions runtime exited before becoming ready");
            }
        });
        try {
            await Promise.race([
                ready.promise,
                exitedBeforeReady,
                Bun.sleep(30_000).then(() => {
                    throw new Error("Local Supabase Edge Functions runtime did not become ready");
                }),
            ]);
        } catch (error) {
            await this.stopCurrent();
            throw error;
        }
    }

    private async stopCurrent(): Promise<void> {
        const subprocess = this.subprocess;
        const draining = this.draining;
        this.subprocess = undefined;
        this.draining = undefined;
        if (!subprocess) {
            return;
        }
        if (subprocess.exitCode === null) {
            subprocess.kill("SIGTERM");
            await Promise.race([
                subprocess.exited,
                Bun.sleep(10_000).then(() => {
                    if (subprocess.exitCode === null) {
                        subprocess.kill("SIGKILL");
                    }
                }),
            ]);
        }
        await draining;
    }
}

async function drainOutput(
    stream: ReadableStream<Uint8Array> | number | undefined,
    inspect: (output: string) => void,
): Promise<void> {
    if (!stream || typeof stream === "number") {
        return;
    }
    const decoder = new TextDecoder();
    const reader = stream.getReader();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            inspect(decoder.decode(value, { stream: true }));
        }
        inspect(decoder.decode());
    } finally {
        reader.releaseLock();
    }
}
