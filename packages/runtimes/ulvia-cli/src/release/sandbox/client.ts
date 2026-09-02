import type { DevRuntimeConfig } from "../../runtime/config";
import type { IntegrationAnswerValue } from "@bernouy/cms-integrations";

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

    async install(kind: string, version: string, answers: Record<string, IntegrationAnswerValue> = {}): Promise<void> {
        await this.post("/api/integrations/import", { kind, version, answers, options: {} }, kind, version);
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
        const result = await safeBody(response);
        if (!response.ok) {
            const installation = await this.installation(kind);
            throw new Error(
                `Release sandbox rejected ${kind}@${version} with HTTP ${response.status}${errorSuffix(result, installation)}`,
            );
        }
        const installation = record(result)?.installation;
        if (record(installation)?.status !== "success") {
            throw new Error(`Release sandbox did not complete ${kind}@${version} successfully`);
        }
    }

    private async installation(kind: string): Promise<unknown> {
        const response = await fetch(`${this.baseUrl}/api/integrations/installations?id=${encodeURIComponent(kind)}`, {
            headers: { cookie: this.cookie ?? "" },
        });
        return response.ok ? await safeBody(response) : undefined;
    }
}

async function safeBody(response: Response): Promise<unknown> {
    const body = await response.text();
    if (!body) {
        return undefined;
    }
    try {
        return JSON.parse(body);
    } catch {
        return body;
    }
}

function errorSuffix(value: unknown, installation?: unknown): string {
    const runError = record(record(record(installation)?.lastRun)?.error)?.message;
    if (typeof runError === "string" && runError.trim()) {
        return ` (${runError.trim().slice(0, 300)})`;
    }
    if (typeof value === "string") {
        const message = value.trim();
        return message ? ` (${message.slice(0, 300)})` : "";
    }
    const parsed = record(value);
    const message = [parsed?.code, parsed?.error, parsed?.message]
        .filter((entry): entry is string => typeof entry === "string")
        .join(": ")
        .slice(0, 300);
    return message ? ` (${message})` : "";
}

function record(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}
