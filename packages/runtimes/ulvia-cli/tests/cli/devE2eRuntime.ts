import { join } from "node:path";
import type { DevRuntimeConfig } from "../../src/runtime/config";
import type { DevPorts } from "../../src/runtime/cms";
import { destroyLocalMongo } from "../../src/runtime/mongo";
import { resolveUlviaPaths } from "../../src/runtime/paths";
import { stopLocalSupabase } from "../../src/runtime/supabase";

export type DevProcess = Readonly<{
    process: ReturnType<typeof Bun.spawn>;
    output: Promise<string>;
}>;

export async function startDev(workspace: string, data: string, ports: DevPorts): Promise<DevProcess> {
    const child = Bun.spawn([process.execPath, join(workspace, "packages/runtimes/ulvia-cli/src/index.ts"), "dev"], {
        cwd: workspace,
        env: { ...globalThis.process.env, ULVIA_DATA_DIR: data, ...devPortEnvironment(ports) },
        stdout: "pipe",
        stderr: "pipe",
    });
    const output = Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]).then((lines) =>
        lines.join("\n"),
    );
    try {
        await waitForHttp(`http://127.0.0.1:${ports.control}`, child);
        return { process: child, output };
    } catch (error) {
        if (child.exitCode === null) {
            child.kill("SIGTERM");
        }
        await child.exited;
        throw new Error(`${error instanceof Error ? error.message : String(error)}\n${await output}`);
    }
}

export function devPortEnvironment(ports: DevPorts): Record<string, string> {
    return {
        ULVIA_DEV_CONTROL_PORT: String(ports.control),
        ULVIA_DEV_DELIVERY_PORT: String(ports.delivery),
        ULVIA_DEV_REPOSITORY_PORT: String(ports.repository),
        ULVIA_DEV_SUPABASE_MANAGEMENT_PORT: String(ports.supabaseManagement),
        ULVIA_DEV_MONGO_PORT: String(ports.mongo),
    };
}

export async function stopDev(dev: DevProcess): Promise<void> {
    if (dev.process.exitCode === null) {
        dev.process.kill("SIGTERM");
    }
    await dev.process.exited;
}

export async function destroyDevData(data: string): Promise<void> {
    const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: data });
    await Promise.all([destroyLocalMongo(paths.mongo), stopLocalSupabase(paths.supabase, { destroy: true })]);
}

async function waitForHttp(url: string, process: ReturnType<typeof Bun.spawn>): Promise<void> {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
        if (process.exitCode !== null) {
            throw new Error(`ulvia dev exited before readiness with code ${process.exitCode}`);
        }
        if (
            await fetch(url, { redirect: "manual" }).then(
                () => true,
                () => false,
            )
        ) {
            return;
        }
        await Bun.sleep(250);
    }
    throw new Error("ulvia dev did not become ready within two minutes");
}

export class DevClient {
    private cookie = "";

    constructor(
        readonly controlUrl: string,
        readonly deliveryUrl: string,
        private readonly config: DevRuntimeConfig,
    ) {}

    async login(): Promise<void> {
        const response = await fetch(`${this.controlUrl}/auth/login`, {
            method: "POST",
            redirect: "manual",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: this.config.adminEmail, password: this.config.adminPassword }),
        });
        this.cookie = response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
        if (response.status !== 302 || !this.cookie) {
            throw new Error(`Local CMS login failed with HTTP ${response.status}`);
        }
    }

    request(path: string, init: RequestInit = {}): Promise<Response> {
        const headers = new Headers(init.headers);
        headers.set("cookie", this.cookie);
        return fetch(new URL(path, this.controlUrl), { ...init, headers });
    }

    async json<T = Record<string, unknown>>(path: string, init: RequestInit = {}): Promise<T> {
        const response = await this.request(path, init);
        const body = await response.json().catch(() => null);
        if (!response.ok) {
            throw new Error(`${init.method ?? "GET"} ${path} returned ${response.status}: ${JSON.stringify(body)}`);
        }
        return body as T;
    }

    post<T = Record<string, unknown>>(path: string, body: unknown): Promise<T> {
        return this.json<T>(path, jsonRequest("POST", body));
    }

    put<T = Record<string, unknown>>(path: string, body: unknown): Promise<T> {
        return this.json<T>(path, jsonRequest("PUT", body));
    }
}

function jsonRequest(method: string, body: unknown): RequestInit {
    return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}
