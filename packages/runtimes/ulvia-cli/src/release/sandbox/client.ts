import type { DevRuntimeConfig } from "../../runtime/config";
import type { IntegrationAnswerValue } from "@bernouy/cms-integrations";

export type ReleaseSandboxInstallation = Readonly<{
    id: string;
    definitionVersion: string;
    status: string;
    runCount: number;
    migrationOperation?: null | Readonly<{
        id: string;
        revision: number;
        status: string;
        currentVersion: string;
        targetVersion: string;
        activatedAt?: string;
        pointOfNoReturnReachedAt?: string;
        journal: readonly Readonly<{
            phase: string;
            status: string;
            error?: Readonly<{ message?: string }>;
        }>[];
    }>;
}>;

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
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                await this.post(
                    `/api/integrations/installations/upgrade?id=${encodeURIComponent(kind)}`,
                    { version },
                    kind,
                    version,
                );
                return;
            } catch (error) {
                const waitMs = migrationDrainWait(error);
                if (waitMs === null || attempt === 2) {
                    throw error;
                }
                await new Promise((resolve) => setTimeout(resolve, waitMs));
            }
        }
    }

    async expectUpgradeAuditFault(kind: string, version: string, phase: string): Promise<void> {
        try {
            await this.upgrade(kind, version);
        } catch {
            return;
        }
        throw new Error(`Release sandbox did not inject the requested migration fault after phase "${phase}"`);
    }

    async expectUpgradeFailure(kind: string, version: string): Promise<void> {
        try {
            await this.upgrade(kind, version);
        } catch {
            return;
        }
        throw new Error(`Release sandbox unexpectedly upgraded ${kind}@${version}`);
    }

    async authorizeAmbiguousReconciliationRetry(
        kind: string,
        operation: Readonly<{ id: string; revision: number }>,
    ): Promise<void> {
        if (!this.cookie) {
            throw new Error("Release sandbox client is not authenticated");
        }
        const response = await fetch(
            `${this.baseUrl}/api/integrations/installations/retry-migration-reconciliation?id=${encodeURIComponent(kind)}`,
            {
                method: "POST",
                headers: { "content-type": "application/json", cookie: this.cookie },
                body: JSON.stringify({
                    expectedOperationId: operation.id,
                    expectedRevision: operation.revision,
                    reason: "Ulvia audit confirmed the intentionally injected ambiguous reconciliation outcome.",
                    confirmation: `retry ambiguous migration reconciliation ${operation.id}`,
                }),
            },
        );
        if (!response.ok) {
            throw new Error(`Release sandbox could not authorize reconciliation retry (HTTP ${response.status})`);
        }
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

    async installation(kind: string): Promise<ReleaseSandboxInstallation> {
        const response = await fetch(`${this.baseUrl}/api/integrations/installations?id=${encodeURIComponent(kind)}`, {
            headers: { cookie: this.cookie ?? "" },
        });
        if (!response.ok) {
            throw new Error(`Release sandbox could not read installation "${kind}" (HTTP ${response.status})`);
        }
        return (await safeBody(response)) as ReleaseSandboxInstallation;
    }
}

function migrationDrainWait(error: unknown): number | null {
    if (!(error instanceof Error)) {
        return null;
    }
    const match = error.message.match(/migration drain period is active until (\d{4}-\d{2}-\d{2}T[^)\s]+Z)/u);
    if (!match?.[1]) {
        return null;
    }
    const waitMs = new Date(match[1]).getTime() - Date.now() + 100;
    if (!Number.isFinite(waitMs) || waitMs > 60_000) {
        throw new Error("Release sandbox migration drain exceeds the one-minute local audit limit", { cause: error });
    }
    return Math.max(waitMs, 0);
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
