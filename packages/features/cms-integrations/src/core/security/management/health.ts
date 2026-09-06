import type { IntegrationHealthEnvelope } from "../../../interfaces/Integration/management";
import type { IntegrationInstallation } from "../../../interfaces/IntegrationInstallation";
import type { IntegrationManagementDeps } from "./contracts";
import { invokeManagement } from "./invoke";
import { parseHealthReport } from "./report";

type Entry = { key: string; checked: number; envelope: IntegrationHealthEnvelope };
export class IntegrationHealthObserver {
    private generation = 0;
    private readonly cache = new Map<string, Entry>();
    private readonly pending = new Map<string, Promise<IntegrationHealthEnvelope>>();
    constructor(private readonly deps: IntegrationManagementDeps) {}
    invalidate(id: string): void {
        this.cache.delete(id);
        this.generation++;
    }
    async read(installation: IntegrationInstallation, refresh = false): Promise<IntegrationHealthEnvelope> {
        const generation = this.generation;
        const key = `${generation}:${installation.id}:${installation.updatedAt.toISOString()}:${installation.definitionVersion}`;
        const cached = this.cache.get(installation.id);
        const ttl = this.deps.healthTtlMs ?? 30_000;
        if (!refresh && cached?.key === key && this.now().getTime() - cached.checked < ttl) {
            return structuredClone(cached.envelope);
        }
        const pending = this.pending.get(key);
        if (pending) {
            return structuredClone(await pending);
        }
        const promise = this.observe(installation, cached?.key === key ? cached : undefined)
            .then((envelope) => {
                if (this.cache.size >= 1_000) {
                    this.cache.delete(this.cache.keys().next().value!);
                }
                if (generation === this.generation) {
                    this.cache.set(installation.id, { key, checked: this.now().getTime(), envelope });
                }
                return envelope;
            })
            .finally(() => this.pending.delete(key));
        this.pending.set(key, promise);
        return structuredClone(await promise);
    }
    private now(): Date {
        return this.deps.now?.() ?? new Date();
    }
    private async observe(
        installation: IntegrationInstallation,
        cached: Entry | undefined,
    ): Promise<IntegrationHealthEnvelope> {
        const now = this.now();
        const envelope: IntegrationHealthEnvelope = {
            schemaVersion: 1,
            installationId: installation.id,
            observedAt: now.toISOString(),
            freshness: cached?.envelope.report ? "stale" : "unavailable",
            observation: "unsupported",
            report: cached?.envelope.report ?? null,
        };
        const management = installation.definitionSnapshot?.management;
        if (!management?.health) {
            return envelope;
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        let result: unknown;
        try {
            result = await Promise.race([
                invokeManagement(this.deps, installation, management.health.functionId, "health").then(
                    ({ public: value }) => value,
                ),
                new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new Error("timeout")), this.deps.healthTimeoutMs ?? 10_000);
                }),
            ]);
        } catch {
            return { ...envelope, observation: "unreachable" };
        } finally {
            if (timer) {
                clearTimeout(timer);
            }
        }
        try {
            const actions = [
                ...(management.actions ?? []).map(({ id }) => id),
                ...(management.settings?.applyFunctionId ? ["apply-settings"] : []),
            ];
            const report = parseHealthReport(result, actions, now);
            return {
                ...envelope,
                observation: "valid",
                freshness:
                    now.getTime() - Date.parse(report.checkedAt) <= (this.deps.healthTtlMs ?? 30_000)
                        ? "fresh"
                        : "stale",
                report,
            };
        } catch {
            return { ...envelope, observation: "invalid_report" };
        }
    }
}
