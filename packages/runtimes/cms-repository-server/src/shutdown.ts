import type { RepositoryServer } from "./core/repositoryServer";

type RepositorySignal = "SIGINT" | "SIGTERM";

export type RepositoryShutdownRegistration = Readonly<{
    shutdown(signal: RepositorySignal): Promise<void>;
    dispose(): void;
}>;

type SignalSource = Pick<NodeJS.Process, "on" | "off">;

export function registerRepositoryShutdown(
    server: RepositoryServer,
    options: Readonly<{
        signals?: SignalSource;
        exit?: (code: number) => void;
        report?: (message: string) => void;
    }> = {},
): RepositoryShutdownRegistration {
    const signals = options.signals ?? process;
    const exit = options.exit ?? ((code) => process.exit(code));
    const report = options.report ?? console.error;
    let shutdownPromise: Promise<void> | undefined;
    const listeners = {
        SIGINT: () => void shutdown("SIGINT"),
        SIGTERM: () => void shutdown("SIGTERM"),
    } as const;

    signals.on("SIGINT", listeners.SIGINT);
    signals.on("SIGTERM", listeners.SIGTERM);

    function shutdown(signal: RepositorySignal): Promise<void> {
        shutdownPromise ??= server.stop().then(
            () => exit(0),
            () => {
                report(`Integration repository shutdown failed after ${signal}`);
                exit(1);
            },
        );
        return shutdownPromise;
    }

    return Object.freeze({
        shutdown,
        dispose() {
            signals.off("SIGINT", listeners.SIGINT);
            signals.off("SIGTERM", listeners.SIGTERM);
        },
    });
}
