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
    let gracefulFailed = false;
    let gracefulError: unknown;
    try {
        let outcome: "stopped" | "timeout" | undefined;
        try {
            outcome = await Promise.race([Promise.resolve(server.stop(false)).then(() => "stopped" as const), timeout]);
        } catch (error) {
            gracefulFailed = true;
            gracefulError = error;
        }
        if (outcome === "timeout" || gracefulFailed) {
            try {
                await server.stop(true);
            } catch (forceError) {
                if (gracefulFailed) {
                    throw new AggregateError([gracefulError, forceError], "Graceful and forced server stop failed");
                }
                throw forceError;
            }
        }
        if (gracefulFailed) {
            throw gracefulError;
        }
    } finally {
        clearTimeout(timer);
    }
}

function validTimeout(value: number): number {
    return Number.isFinite(value) && value >= 0 && value <= 60_000 ? value : DEFAULT_GRACEFUL_STOP_TIMEOUT_MS;
}
