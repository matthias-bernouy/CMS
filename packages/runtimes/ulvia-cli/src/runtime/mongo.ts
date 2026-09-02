import { createHash } from "node:crypto";
import { createConnection } from "node:net";
import { requireExecutable, runCommand } from "./process";

const MONGO_IMAGE = "mongo:7.0.37@sha256:d5b3ca8c3f3cdce78d44870dc0871b76d5235e9b2ad4ea6bea5d1fbff8027703";

export type LocalMongo = Readonly<{
    name: string;
    url: string;
    port: number;
}>;

export async function startLocalMongo(dataRoot: string, port: number): Promise<LocalMongo> {
    requireExecutable("docker");
    const name = containerName(dataRoot);
    const status = await containerStatus(name);
    if (status === null) {
        await runCommand(
            [
                "docker",
                "run",
                "--detach",
                "--name",
                name,
                "--publish",
                `127.0.0.1:${port}:27017`,
                "--mount",
                `type=bind,source=${dataRoot},target=/data/db`,
                MONGO_IMAGE,
            ],
            { inherit: true },
        );
    } else if (status !== "running") {
        await runCommand(["docker", "start", name], { inherit: true });
    }
    await waitForPort(port);
    return { name, url: `mongodb://127.0.0.1:${port}/ulvia_dev`, port };
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

function containerName(dataRoot: string): string {
    const suffix = createHash("sha256").update(dataRoot).digest("hex").slice(0, 12);
    return `ulvia-dev-mongo-${suffix}`;
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
