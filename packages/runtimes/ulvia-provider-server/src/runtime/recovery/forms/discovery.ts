import { MongoFormsRepository } from "@bernouy/forms/mongo";
import type { ProviderInstanceRegistry } from "@bernouy/ulvia-provider";
import type { MongoClient } from "mongodb";
import type { ProviderInstanceHost } from "../../instances/composition/ProviderInstanceHost";
import { instanceDatabaseName } from "../../stores/storageRoots";

/** One indexed metadata page per tick; idle instances are opened only for due Forms work. */
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
                if (!(await MongoFormsRepository.hasWork(this.mongo.db(instanceDatabaseName(instance.storageKey))))) {
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
