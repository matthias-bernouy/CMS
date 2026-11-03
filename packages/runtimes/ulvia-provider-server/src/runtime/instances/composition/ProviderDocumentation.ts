import type { CmsDocumentation } from "@bernouy/cms-documentation";
import { TransformersEmbeddings } from "@bernouy/text-embeddings";
import type { EmbeddingModelOptions } from "@bernouy/text-embeddings";
import type { Logger } from "@bernouy/logging";
import type { ProviderInstanceRecord } from "@bernouy/ulvia-provider";
import type { ResourceLease } from "../InstanceResourcePool";
import { DocumentationPreparationQueue } from "./DocumentationPreparationQueue";

/** Runtime-owned scheduling; queued records do not retain Mongo-backed instance resources. */
export class ProviderDocumentation {
    readonly model: TransformersEmbeddings;
    private readonly queue: DocumentationPreparationQueue;
    private startup?: Promise<void>;
    private stopping = false;
    constructor(
        modelOptions: EmbeddingModelOptions,
        private readonly open: (
            instance: ProviderInstanceRecord,
        ) => Promise<ResourceLease<{ documentation: CmsDocumentation }>>,
        private readonly logger: Logger,
    ) {
        this.model = new TransformersEmbeddings({ ...modelOptions, threads: 2 });
        this.queue = new DocumentationPreparationQueue((preparationKey, error) =>
            logger.warn("provider.documentation.preparation.failed", { preparationKey }, error),
        );
    }

    start(instances: readonly ProviderInstanceRecord[]): void {
        if (this.startup || this.stopping) {
            return;
        }
        this.queue.request("model", (signal) => this.model.initialize(signal));
        this.startup = (async () => {
            await this.queue.idle();
            for (const instance of instances) {
                if (this.stopping) {
                    break;
                }
                if (instance.status === "ready") {
                    this.request(instance);
                    await this.queue.idle();
                }
            }
        })().catch((error) => this.logger.warn("provider.documentation.startup.failed", {}, error));
    }

    request(instance: ProviderInstanceRecord, changed = false): void {
        const key = JSON.stringify([instance.id, instance.profile.id, instance.profile.version]);
        if (this.stopping || (!changed && this.queue.contains(key))) {
            return;
        }
        this.queue.request(key, async (signal) => {
            const lease = await this.open(instance);
            const started = performance.now();
            try {
                const prepared = await lease.resource.documentation.prepare(signal);
                this.logger.info("provider.documentation.prepared", {
                    instanceId: instance.id,
                    ...prepared,
                    durationMs: Math.round(performance.now() - started),
                });
            } finally {
                lease.release();
            }
        });
    }

    async stop(): Promise<void> {
        this.stopping = true;
        await this.queue.close();
        await this.startup;
    }

    async close(): Promise<void> {
        await this.stop();
        await this.model.close();
    }
}
