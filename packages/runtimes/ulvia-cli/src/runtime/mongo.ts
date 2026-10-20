import { createHash } from "node:crypto";
import { createConnection } from "node:net";
import { NOOP_LOGGER, type Logger } from "@bernouy/logging";
import { requireExecutable, runCommand } from "./process";

const MONGO_IMAGE = "mongo:7.0.37@sha256:d5b3ca8c3f3cdce78d44870dc0871b76d5235e9b2ad4ea6bea5d1fbff8027703";

export type LocalMongo = Readonly<{
    name: string;
    url: string;
    port: number;
}>;

export async function startLocalMongo(
    dataRoot: string,
    port: number,
    options: Readonly<{ ephemeral?: boolean; logger?: Logger }> = {},
): Promise<LocalMongo> {
    requireExecutable("docker");
    const name = containerName(dataRoot);
    const status = await containerStatus(name);
    const publishedPort = status === null ? null : await containerPublishedPort(name);
    const action = planMongoContainerAction(status, publishedPort, port);
    const logger = options.logger ?? NOOP_LOGGER;
    if (action === "recreate") {
        logger.warn("mongo.container.recreating", {
            name,
            status,
            configuredPort: publishedPort,
            requestedPort: port,
        });
        await runCommand(["docker", "rm", "--force", name]);
    }
    if (action === "create" || action === "recreate") {
        await createContainer(name, dataRoot, port, options.ephemeral ?? false, logger);
    } else if (action === "start") {
        await runCommand(["docker", "start", name], { inherit: true });
        logger.info("mongo.container.started", { name, port });
    }
    const startedAt = performance.now();
    await waitForPort(port);
    logger.info("mongo.ready", { name, port, durationMs: Math.round(performance.now() - startedAt) });
    return { name, url: localMongoUrl(port), port };
}

export function planMongoContainerAction(
    status: string | null,
    publishedPort: number | null,
    requestedPort: number,
): "create" | "recreate" | "start" | "reuse" {
    if (status === null) {
        return "create";
    }
    if (publishedPort !== requestedPort) {
        return "recreate";
    }
    return status === "running" ? "reuse" : "start";
}

export function localMongoUrl(port: number): string {
    return `mongodb://127.0.0.1:${port}/ulvia_dev?retryWrites=false`;
}

function currentUser(): string[] {
    const uid = process.getuid?.();
    const gid = process.getgid?.();
    return uid === undefined || gid === undefined ? [] : ["--user", `${uid}:${gid}`];
}

export async function localMongoStatus(dataRoot: string): Promise<string | null> {
    requireExecutable("docker");
    return await containerStatus(containerName(dataRoot));
}

export async function stopLocalMongo(dataRoot: string): Promise<boolean> {
    requireExecutable("docker");
    const name = containerName(dataRoot);
    if ((await containerStatus(name)) !== "running") {
        return false;
    }
    await runCommand(["docker", "stop", name], { inherit: true });
    return true;
}

async function containerStatus(name: string): Promise<string | null> {
    const result = await runCommand(["docker", "inspect", "--format", "{{.State.Status}}", name], {
        allowFailure: true,
    });
    return result.exitCode === 0 ? result.stdout.trim() : null;
}

async function containerPublishedPort(name: string): Promise<number | null> {
    const result = await runCommand(["docker", "inspect", "--format", "{{json .HostConfig.PortBindings}}", name], {
        allowFailure: true,
    });
    if (result.exitCode !== 0) {
        return null;
    }
    const bindings = JSON.parse(result.stdout) as Record<string, Array<{ HostPort?: string }> | null>;
    const value = bindings["27017/tcp"]?.[0]?.HostPort;
    if (!value) {
        return null;
    }
    const port = Number(value);
    return Number.isSafeInteger(port) && port > 0 ? port : null;
}

function containerName(dataRoot: string): string {
    const suffix = createHash("sha256").update(dataRoot).digest("hex").slice(0, 12);
    return `ulvia-dev-mongo-${suffix}`;
}

async function createContainer(
    name: string,
    dataRoot: string,
    port: number,
    ephemeral: boolean,
    logger: Logger,
): Promise<void> {
    const persistence = ephemeral ? [] : ["--mount", `type=bind,source=${dataRoot},target=/data/db`];
    const owner = ephemeral ? [] : currentUser();
    try {
        await runCommand([
            "docker",
            "run",
            "--detach",
            "--name",
            name,
            "--publish",
            `127.0.0.1:${port}:27017`,
            ...owner,
            ...persistence,
            MONGO_IMAGE,
        ]);
        logger.info("mongo.container.created", { name, port, persistent: !ephemeral });
    } catch (error) {
        logger.error("mongo.container.creation_failed", { name, port }, error);
        await runCommand(["docker", "rm", "--force", name], { allowFailure: true });
        throw error;
    }
}

async function waitForPort(port: number): Promise<void> {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
        if (await canConnect(port)) {
            return;
        }
        await Bun.sleep(250);
    }
    throw new Error(`Local MongoDB did not become ready on 127.0.0.1:${port}`);
}

function canConnect(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = createConnection({ host: "127.0.0.1", port });
        socket.setTimeout(500);
        socket.once("connect", () => {
            socket.destroy();
            resolve(true);
        });
        socket.once("error", () => resolve(false));
        socket.once("timeout", () => {
            socket.destroy();
            resolve(false);
        });
    });
}
