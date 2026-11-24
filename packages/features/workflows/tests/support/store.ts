import { WorkflowError } from "@bernouy/workflows";
import { createHash } from "node:crypto";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import type {
    WorkflowStore,
    WorkflowValues,
    WorkflowDraft,
    WorkflowTrigger,
    WorkflowRun,
    WorkflowPlan,
} from "@bernouy/workflows";
import type { EventMessage } from "@bernouy/cms-gateway/events";
export class MemoryWorkflowStore implements WorkflowStore, WorkflowValues {
    readonly drafts = new Map<string, WorkflowDraft>();
    readonly plans = new Map<string, { plan: WorkflowPlan; retired: boolean; confirmed?: boolean }>();
    readonly triggerRecords = new Map<string, WorkflowTrigger>();
    readonly versions = new Map<string, WorkflowTrigger>();
    readonly runRecords = new Map<string, WorkflowRun>();
    readonly inbox = new Map<string, string>();
    readonly values = new Map<string, unknown>();
    readonly valueScopes = new Map<string, string>();
    reads = 0;
    async accept(_runId: string) {}
    async purge(runId: string, _limit: number) {
        // References carry the scope; tests keep a separate compact value map.
        for (const [key, scope] of this.valueScopes) {
            if (scope === runId) {
                this.values.delete(key);
                this.valueScopes.delete(key);
            }
        }
        return true;
    }
    async put(runId: string, slot: string, value: unknown) {
        const id = createHash("sha256").update(`${runId}:${slot}`).digest("hex");
        if (this.values.has(id) && canonicalizeIJson(this.values.get(id)) !== canonicalizeIJson(value)) {
            throw new WorkflowError("VALUE_CONFLICT");
        }
        this.values.set(id, structuredClone(value));
        this.valueScopes.set(id, runId);
        return `${runId}:${id}`;
    }
    async get(runId: string, reference: string) {
        if (!reference.startsWith(`${runId}:`)) {
            throw new Error("Cross-run value");
        }
        return structuredClone(this.values.get(reference.slice(runId.length + 1)));
    }
    async createDraft(record: WorkflowDraft) {
        if (!this.drafts.has(record.id)) {
            this.drafts.set(record.id, structuredClone(record));
        }
        return this.drafts.get(record.id)!;
    }
    async draft(id: string) {
        this.reads++;
        return structuredClone(this.drafts.get(id) ?? null);
    }
    async updateDraft(record: WorkflowDraft, revision: number) {
        if (this.drafts.get(record.id)?.revision !== revision) {
            return false;
        }
        this.drafts.set(record.id, structuredClone(record));
        return true;
    }
    async publish(id: string, revision: number, plan: WorkflowPlan) {
        const draft = this.drafts.get(id);
        if (draft?.revision !== revision) {
            return false;
        }
        this.plans.set(`${id}:${revision}`, { plan: structuredClone(plan), retired: false });
        this.drafts.set(id, { ...draft, publishedRevision: revision });
        return true;
    }
    async plan(id: string, revision: number, existingRun = false) {
        const value = this.plans.get(`${id}:${revision}`);
        return value && value.confirmed !== false && (existingRun || !value.retired)
            ? structuredClone(value.plan)
            : null;
    }
    async retire(id: string, revision: number) {
        const value = this.plans.get(`${id}:${revision}`);
        if (!value) {
            return false;
        }
        value.retired = true;
        return true;
    }
    async publishInstalledPlan(_installationId: string, id: string, revision: number, plan: WorkflowPlan) {
        this.plans.set(`${id}:${revision}`, { plan: structuredClone(plan), retired: false, confirmed: false });
    }
    async confirmInstalledPlan(_installationId: string, id: string, revision: number) {
        const value = this.plans.get(`${id}:${revision}`);
        if (!value) {
            throw new Error("Missing plan");
        }
        value.confirmed = true;
    }
    async retireInstalledPlans(workflowId: string) {
        for (const [id, value] of this.plans) {
            if (id.startsWith(`${workflowId}:`)) {
                value.retired = true;
            }
        }
    }
    async triggersForWorkflow(workflowId: string, limit: number) {
        return structuredClone(
            [...this.triggerRecords.values()]
                .filter((record) => record.workflowId === workflowId && record.state !== "deleted")
                .slice(0, limit),
        );
    }
    async createTrigger(record: WorkflowTrigger) {
        if (!this.triggerRecords.has(record.id)) {
            this.triggerRecords.set(record.id, structuredClone(record));
        }
        return structuredClone(this.triggerRecords.get(record.id)!);
    }
    async trigger(id: string, revision?: number) {
        this.reads++;
        return structuredClone(
            (revision === undefined ? this.triggerRecords.get(id) : this.versions.get(`${id}:${revision}`)) ?? null,
        );
    }
    async triggers(cursor: string | undefined, limit: number) {
        return page([...this.triggerRecords.values()], cursor, limit);
    }
    async triggerBySubscription(id: string) {
        return structuredClone(
            [...this.triggerRecords.values()].find((record) => record.subscriptionId === id) ?? null,
        );
    }
    async pendingTriggers(limit: number, after?: string) {
        return [...this.triggerRecords.values()]
            .filter((record) => ["preparing", "suspending", "deleting"].includes(record.state))
            .slice(0, limit)
            .map((record) => structuredClone(record));
    }
    async updateTrigger(record: WorkflowTrigger, revision: number) {
        if (this.triggerRecords.get(record.id)?.revision !== revision) {
            return false;
        }
        this.triggerRecords.set(record.id, structuredClone(record));
        if (record.state === "active") {
            this.versions.set(`${record.subscriptionId}:${record.subscriptionRevision}`, structuredClone(record));
        }
        return true;
    }
    async createRun(record: WorkflowRun) {
        if (!this.runRecords.has(record.id)) {
            this.runRecords.set(record.id, structuredClone(record));
        }
        return structuredClone(this.runRecords.get(record.id)!);
    }
    async eventReceipt(deliveryId: string) {
        return this.inbox.get(deliveryId) ?? null;
    }
    async acceptEvent(event: EventMessage, fingerprint: string, record: WorkflowRun | null) {
        const existing = this.inbox.get(event.deliveryId);
        if (existing && existing !== fingerprint) {
            throw new Error("Conflicting delivery");
        }
        if (!existing) {
            this.inbox.set(event.deliveryId, fingerprint);
            if (record) {
                await this.createRun(record);
            }
        }
    }
    async run(id: string) {
        return structuredClone(this.runRecords.get(id) ?? null);
    }
    async runs(cursor: string | undefined, limit: number) {
        return page([...this.runRecords.values()], cursor, limit);
    }
    async claim(now: number, token: string, expiresAt: number) {
        const record = [...this.runRecords.values()].find(
            (record) =>
                ["queued", "running", "waiting"].includes(record.status) &&
                record.dueAt <= now &&
                (!record.lease || record.lease.expiresAt <= now),
        );
        if (!record) {
            return null;
        }
        const next: WorkflowRun = {
            ...record,
            status: "running",
            revision: record.revision + 1,
            lease: { token, expiresAt },
        };
        this.runRecords.set(record.id, next);
        return structuredClone(next);
    }
    async renew(id: string, token: string, now: number, expiresAt: number) {
        const record = this.runRecords.get(id);
        if (!record || record.lease?.token !== token || record.lease.expiresAt <= now) {
            return false;
        }
        this.runRecords.set(id, { ...record, lease: { token, expiresAt } });
        return true;
    }
    async checkpoint(record: WorkflowRun, revision: number, token: string | undefined, now: number) {
        const current = this.runRecords.get(record.id);
        if (
            !current ||
            current.revision !== revision ||
            (token && (current.lease?.token !== token || current.lease.expiresAt <= now))
        ) {
            return false;
        }
        this.runRecords.set(record.id, structuredClone(record));
        return true;
    }
}
function page<T extends { id: string }>(records: readonly T[], cursor: string | undefined, limit: number) {
    const sorted = records.filter(({ id }) => !cursor || id > cursor).sort((a, b) => a.id.localeCompare(b.id));
    return {
        items: structuredClone(sorted.slice(0, limit)),
        ...(sorted.length > limit ? { nextCursor: sorted[limit - 1]!.id } : {}),
    };
}
