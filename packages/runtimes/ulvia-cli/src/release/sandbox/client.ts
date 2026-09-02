import type { DevRuntimeConfig } from "../../runtime/config";

export class ReleaseSandboxClient {
    private cookie?: string;

    constructor(
        private readonly baseUrl: string,
        private readonly config: DevRuntimeConfig,
    ) {}

    async login(): Promise<void> {
        const response = await fetch(`${this.baseUrl}/auth/login`, {
            method: "POST",
            redirect: "manual",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: this.config.adminEmail, password: this.config.adminPassword }),
        });
        const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
        if (response.status !== 302 || !cookie) {
            throw new Error(`Release sandbox login failed with HTTP ${response.status}`);
        }
        this.cookie = cookie;
    }

    async install(kind: string, version: string): Promise<void> {
        await this.post("/api/integrations/import", { kind, version, answers: {}, options: {} }, kind, version);
    }

    async upgrade(kind: string, version: string): Promise<void> {
        await this.post(
            `/api/integrations/installations/upgrade?id=${encodeURIComponent(kind)}`,
            { version },
            kind,
            version,
        );
    }

    async adoptBaseline(kind: string, body: Record<string, unknown>): Promise<void> {
        await this.post(
            `/api/integrations/installations/adopt-baseline?id=${encodeURIComponent(kind)}`,
            body,
            kind,
            String(body.version),
        );
    }

    private async post(path: string, body: unknown, kind: string, version: string): Promise<void> {
        if (!this.cookie) {
            throw new Error("Release sandbox client is not authenticated");
        }
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: "POST",
            headers: { "content-type": "application/json", cookie: this.cookie },
            body: JSON.stringify(body),
        });
        const result = await safeJson(response);
        if (!response.ok) {
            throw new Error(
                `Release sandbox rejected ${kind}@${version} with HTTP ${response.status}${errorSuffix(result)}`,
            );
        }
        const installation = record(result)?.installation;
        if (record(installation)?.status !== "success") {
            throw new Error(`Release sandbox did not complete ${kind}@${version} successfully`);
        }
    }
}

async function safeJson(response: Response): Promise<unknown> {
    return await response.json().catch(() => undefined);
}

function errorSuffix(value: unknown): string {
    const parsed = record(value);
    const message = [parsed?.code, parsed?.error]
        .filter((entry): entry is string => typeof entry === "string")
        .join(": ")
        .slice(0, 300);
    return message ? ` (${message})` : "";
}

function record(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}
