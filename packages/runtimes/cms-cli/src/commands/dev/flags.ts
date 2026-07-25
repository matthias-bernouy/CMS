export type LocalRuntimeMode = "DEV" | "PROD";

export interface LocalRuntimeOptions {
    command: "dev" | "preview";
    mode: LocalRuntimeMode;
}

export type DevFlags = {
    port: number;
    host: string;
    deliveryPort: number;
    publicHost: string;
    workers: boolean;
    sourceImages: boolean;
};

export const LOCAL_RUNTIME_PROFILES = {
    dev: { command: "dev", mode: "DEV" },
    preview: { command: "preview", mode: "PROD" },
} as const satisfies Record<LocalRuntimeOptions["command"], LocalRuntimeOptions>;

export function parseDevFlags(args: string[]): DevFlags {
    let port = 5000;
    let host = "localhost";
    let workers = true;
    let sourceImages = true;
    for (const arg of args) {
        if (arg.startsWith("--port=")) {
            port = parsePortFlag(arg.slice("--port=".length));
        } else if (arg.startsWith("--host=")) {
            host = arg.slice("--host=".length) || host;
        } else if (arg === "--workers") {
            workers = true;
        } else if (arg === "--no-workers") {
            workers = false;
        } else if (arg === "--source-images") {
            sourceImages = true;
        } else if (arg === "--no-source-images") {
            sourceImages = false;
        }
    }

    const deliveryPort = port + 1;
    if (deliveryPort > 65535) {
        throw new Error("--port must be <= 65534 because Delivery uses port + 1");
    }
    const publicHost = host === "0.0.0.0" ? "localhost" : host;
    return { port, host, deliveryPort, publicHost, workers, sourceImages };
}

function parsePortFlag(raw: string): number {
    if (!/^\d+$/.test(raw)) {
        throw new Error("--port must be an integer");
    }
    const port = Number(raw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error("--port must be between 1 and 65535");
    }
    return port;
}
