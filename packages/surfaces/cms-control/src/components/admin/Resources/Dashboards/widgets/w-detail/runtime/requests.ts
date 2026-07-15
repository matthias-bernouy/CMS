import type { DashboardDataRef } from "@bernouy/cms-dashboards";
import type { RuntimeVars } from "../../../runtime/expressions";
import { fetchSourceJson, sourceRequestKey } from "../../../runtime/source";

export type DetailRequestConsumer = symbol;

type InFlightRequest = {
    controller: AbortController;
    consumers: Set<DetailRequestConsumer>;
    promise: Promise<unknown>;
};

export class DetailRequestCoordinator {
    private readonly inFlight = new Map<string, InFlightRequest>();
    private readonly consumerKeys = new Map<DetailRequestConsumer, Set<string>>();
    private scopeKey = "";

    createConsumer(): DetailRequestConsumer {
        return Symbol("detail-request-consumer");
    }

    syncScope(scopeKey: string): void {
        if (this.scopeKey === scopeKey) return;
        this.clear();
        this.scopeKey = scopeKey;
    }

    load(
        consumer: DetailRequestConsumer,
        sourceId: string,
        ref: DashboardDataRef,
        vars: RuntimeVars,
    ): Promise<unknown> {
        const key = sourceRequestKey(sourceId, ref, vars);
        let request = this.inFlight.get(key);
        if (!request) {
            const controller = new AbortController();
            request = {
                controller,
                consumers: new Set(),
                promise: fetchSourceJson(sourceId, ref, vars, { signal: controller.signal }),
            };
            this.inFlight.set(key, request);
            const current = request;
            void current.promise.then(
                () => this.finish(key, current),
                () => this.finish(key, current),
            );
        }
        this.attach(consumer, key, request);
        return request.promise;
    }

    cancel(consumer: DetailRequestConsumer): void {
        const keys = this.consumerKeys.get(consumer);
        if (!keys) return;
        for (const key of keys) {
            const request = this.inFlight.get(key);
            if (!request) continue;
            request.consumers.delete(consumer);
            if (request.consumers.size === 0) {
                request.controller.abort();
                this.inFlight.delete(key);
            }
        }
        this.consumerKeys.delete(consumer);
    }

    clear(): void {
        for (const request of this.inFlight.values()) request.controller.abort();
        this.inFlight.clear();
        this.consumerKeys.clear();
    }

    private attach(consumer: DetailRequestConsumer, key: string, request: InFlightRequest): void {
        request.consumers.add(consumer);
        const keys = this.consumerKeys.get(consumer) ?? new Set<string>();
        keys.add(key);
        this.consumerKeys.set(consumer, keys);
    }

    private finish(key: string, request: InFlightRequest): void {
        if (this.inFlight.get(key) !== request) return;
        this.inFlight.delete(key);
        for (const consumer of request.consumers) {
            const keys = this.consumerKeys.get(consumer);
            keys?.delete(key);
            if (keys?.size === 0) this.consumerKeys.delete(consumer);
        }
    }
}
