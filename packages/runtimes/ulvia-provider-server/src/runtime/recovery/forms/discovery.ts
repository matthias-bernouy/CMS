import type { Db } from "mongodb";
import { MongoFormsRepository } from "@bernouy/forms/mongo";
import type { ProviderInstanceRegistry } from "@bernouy/ulvia-provider";
import type { MongoClient } from "mongodb";
import type { ProviderInstanceHost } from "../../instances/composition/ProviderInstanceHost";
import { instanceDatabaseName } from "../../stores/storageRoots";

async function automationWork(db: Db) {
    const probes = [
        ["event_membership_heads", { _id: "default", pending: { $exists: true } }],
        ["event_publications", { siteId: "default", pending: true }],
        ["domain_event_outbox", { siteId: "default", dueAt: { $type: "date" } }],
        [
            "workflow_runs",
            { status: { $in: ["queued", "running", "waiting"] }, dueAt: { $lt: Number.MAX_SAFE_INTEGER } },
        ],
        ["workflow_triggers", { state: { $in: ["active", "preparing", "suspending", "deleting"] } }],
        ["workflow_installations", { state: "removing" }],
        ["workflow_installations", { pendingPublication: { $gt: 0 } }],
        ["workflow_runs", { orphanPurgePending: true }],
        ["workflow_value_scopes", { accepted: false, createdAt: { $lte: new Date(Date.now() - 604800000) } }],
        ["workflow_runs", { purgeAt: { $lte: new Date() } }],
        ["workflow_definitions", { "publication.revision": { $exists: true } }],
    ] as const;
    for (const [name, filter] of probes) {
        if (await db.collection<{ _id: string }>(name).findOne(filter, { projection: { _id: 1 }, maxTimeMS: 2000 })) {
            return true;
        }
    }
    return false;
}
/** One bounded metadata page per tick; only retained business work or active trigger validation opens an instance. */
export class FormsDiscovery {
    private cursor: string | null = null;
    private stopped = false;
    private timer?: ReturnType<typeof setInterval>;
    private pending?: Promise<void>;
    constructor(
        private readonly instances: Pick<ProviderInstanceRegistry, "page">,
        private readonly mongo: MongoClient,
        private readonly host: ProviderInstanceHost,
        private readonly report: (error: unknown) => void,
    ) {}
    start() {
        this.timer = setInterval(() => void this.tick(), 10000);
        this.timer.unref();
        void this.tick();
    }
    private tick() {
        if (this.stopped || this.pending) {
            return;
        }
        this.pending = this.scan()
            .catch(this.report)
            .finally(() => {
                this.pending = undefined;
            });
    }
    private async scan() {
        const page = await this.instances.page({ after: this.cursor, limit: 50 });
        for (const instance of page.items) {
            if (this.stopped) {
                return;
            }
            if (instance.status !== "ready") {
                continue;
            }
            try {
                const db = this.mongo.db(instanceDatabaseName(instance.storageKey));
                if (!(await MongoFormsRepository.hasWork(db)) && !(await automationWork(db))) {
                    continue;
                }
                const lease = await this.host.runtime(instance);
                lease.release();
            } catch (error) {
                this.report(error);
            }
        }
        this.cursor = page.nextCursor;
    }
    async stop() {
        this.stopped = true;
        clearInterval(this.timer);
        await this.pending;
    }
}
