import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DevPorts } from "../cms";
import type { UlviaPaths } from "../paths";

const SUPERVISOR_SCHEMA = "ulvia.dev-supervisor.v1";

type DevSupervisorState = Readonly<{
    schema: typeof SUPERVISOR_SCHEMA;
    pid: number;
    processStartId: string;
    dataDirectory: string;
    ports: DevPorts;
}>;

export async function registerDevSupervisor(paths: UlviaPaths, ports: DevPorts): Promise<() => Promise<void>> {
    const existing = await readDevSupervisor(paths);
    if (existing && (await isSupervisorActive(existing))) {
        throw new Error(`An Ulvia dev stack is already supervised for ${paths.data} (PID ${existing.pid})`);
    }
    const state: DevSupervisorState = {
        schema: SUPERVISOR_SCHEMA,
        pid: process.pid,
        processStartId: await processStartId(process.pid),
        dataDirectory: paths.data,
        ports,
    };
    await writeFile(supervisorPath(paths), `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600 });
    return async () => {
        const current = await readDevSupervisor(paths);
        if (current?.pid === state.pid && current.processStartId === state.processStartId) {
            await rm(supervisorPath(paths), { force: true });
        }
    };
}

export async function inspectDevSupervisor(paths: UlviaPaths): Promise<{
    state: DevSupervisorState | null;
    status: "active" | "stale" | "missing";
}> {
    const state = await readDevSupervisor(paths);
    if (!state) {
        return { state: null, status: "missing" };
    }
    return { state, status: (await isSupervisorActive(state)) ? "active" : "stale" };
}

export async function stopDevSupervisor(paths: UlviaPaths): Promise<"stopped" | "stale" | "missing"> {
    const inspected = await inspectDevSupervisor(paths);
    if (!inspected.state) {
        return "missing";
    }
    if (inspected.status === "stale") {
        await rm(supervisorPath(paths), { force: true });
        return "stale";
    }
    process.kill(inspected.state.pid, "SIGTERM");
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline && (await isSupervisorActive(inspected.state))) {
        await Bun.sleep(100);
    }
    if (await isSupervisorActive(inspected.state)) {
        process.kill(inspected.state.pid, "SIGKILL");
    }
    await rm(supervisorPath(paths), { force: true });
    return "stopped";
}

export async function probeDevServices(
    ports: DevPorts,
): Promise<Record<"kernel" | "provider" | "repository", boolean>> {
    const [kernel, provider, repository] = await Promise.all([
        probeHttp(`http://127.0.0.1:${ports.kernel}/login`),
        probeHttp(`http://127.0.0.1:${ports.provider}/ulvia/report`),
        probeHttp(`http://127.0.0.1:${ports.repository}/v1/collections`),
    ]);
    return { kernel, provider, repository };
}

async function readDevSupervisor(paths: UlviaPaths): Promise<DevSupervisorState | null> {
    const source = await readFile(supervisorPath(paths), "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    });
    if (!source) {
        return null;
    }
    try {
        const value = JSON.parse(source) as Partial<DevSupervisorState>;
        if (
            value.schema !== SUPERVISOR_SCHEMA ||
            !Number.isSafeInteger(value.pid) ||
            Number(value.pid) < 1 ||
            typeof value.processStartId !== "string" ||
            !value.processStartId ||
            value.dataDirectory !== paths.data ||
            !validPorts(value.ports)
        ) {
            return null;
        }
        return value as DevSupervisorState;
    } catch {
        return null;
    }
}

async function isSupervisorActive(state: DevSupervisorState): Promise<boolean> {
    try {
        process.kill(state.pid, 0);
        return (await processStartId(state.pid)) === state.processStartId;
    } catch {
        return false;
    }
}

async function processStartId(pid: number): Promise<string> {
    const stat = await readFile(`/proc/${pid}/stat`, "utf8");
    const closing = stat.lastIndexOf(")");
    const fields = stat
        .slice(closing + 1)
        .trim()
        .split(/\s+/u);
    const startTime = fields[19];
    if (closing < 1 || !startTime || !/^\d+$/u.test(startTime)) {
        throw new Error(`Cannot identify process ${pid}`);
    }
    return startTime;
}

async function probeHttp(url: string): Promise<boolean> {
    return await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(1_000) }).then(
        () => true,
        () => false,
    );
}

function validPorts(value: unknown): value is DevPorts {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const ports = value as Record<string, unknown>;
    return ["kernel", "mongo", "repository", "provider"].every(
        (key) => Number.isSafeInteger(ports[key]) && Number(ports[key]) >= 1 && Number(ports[key]) <= 65_535,
    );
}

function supervisorPath(paths: UlviaPaths): string {
    return join(paths.dev, "supervisor.json");
}
