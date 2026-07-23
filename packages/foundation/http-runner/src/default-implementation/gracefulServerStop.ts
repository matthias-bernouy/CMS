const DEFAULT_GRACEFUL_STOP_TIMEOUT_MS = 5_000;

type StoppableServer = {
    stop(closeActiveConnections?: boolean): void | Promise<void>;
};

export async function stopServerGracefully(
    server: StoppableServer | undefined,
    timeoutMs = DEFAULT_GRACEFUL_STOP_TIMEOUT_MS,
): Promise<void> {
    if (!server) {
        return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), validTimeout(timeoutMs));
        timer.unref?.();
    });
    try {
        const outcome = await Promise.race([
            Promise.resolve(server.stop(false)).then(() => "stopped" as const),
            timeout,
        ]);
        if (outcome === "timeout") {
            await server.stop(true);
        }
    } finally {
        clearTimeout(timer);
    }
}

function validTimeout(value: number): number {
    return Number.isFinite(value) && value >= 0 && value <= 60_000 ? value : DEFAULT_GRACEFUL_STOP_TIMEOUT_MS;
}
