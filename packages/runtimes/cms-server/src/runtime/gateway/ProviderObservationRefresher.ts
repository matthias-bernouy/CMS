import type { GatewayHttpNetwork } from "@bernouy/cms-gateway/http";
import type { ContractSelectionStore } from "@bernouy/cms-repository/providers/selections";
import {
    DEFAULT_PROVIDER_INSTALLATION_LIMITS,
    parseProviderRuntimeReportJson,
    PROVIDER_CONNECTION_PROTOCOL,
    ProviderInstallationWorkflowError,
    type ProviderInstallationStore,
    type StoredProviderInstallation,
} from "@bernouy/cms-repository/providers/installations";

const REFRESH_INTERVAL_MS = 10_000;
const MIN_OBSERVATION_AGE_MS = 25_000;
const REPORT_TIMEOUT_MS = 5_000;
const MAX_CONCURRENT_REPORTS = 16;

/** Refreshes CMS-owned observations through the same pinned network boundary as invocations. */
export class ProviderObservationRefresher {
    #timer?: ReturnType<typeof setInterval>;
    #running?: Promise<void>;
    #onError: (error: Error) => void = () => undefined;
    #stopping = false;

    constructor(
        private readonly siteId: string,
        private readonly selections: Pick<ContractSelectionStore, "get">,
        private readonly installations: ProviderInstallationStore,
        private readonly network: GatewayHttpNetwork,
    ) {}

    start(onError: (error: Error) => void): void {
        if (this.#timer) {
            return;
        }
        this.#stopping = false;
        this.#onError = onError;
        void this.runOnce().catch((error) => this.#onError(safeError(error)));
        this.#timer = setInterval(() => {
            void this.runOnce().catch((error) => this.#onError(safeError(error)));
        }, REFRESH_INTERVAL_MS);
        this.#timer.unref?.();
    }

    async stop(): Promise<void> {
        this.#stopping = true;
        if (this.#timer) {
            clearInterval(this.#timer);
            this.#timer = undefined;
        }
        await this.#running?.catch(() => undefined);
    }

    runOnce(): Promise<void> {
        if (this.#running) {
            return this.#running;
        }
        const running = this.#refresh();
        this.#running = running;
        void running
            .finally(() => {
                if (this.#running === running) {
                    this.#running = undefined;
                }
            })
            .catch(() => undefined);
        return running;
    }

    async #refresh(): Promise<void> {
        const selected = await this.selections.get(this.siteId);
        if (!selected) {
            return;
        }
        const installationIds = new Set(selected.plan.selections.map((selection) => selection.installationId));
        const now = Date.now();
        const queue = (await this.installations.list(this.siteId)).filter((record) => {
            if (record.installation.status !== "enabled" || !installationIds.has(record.installation.id)) {
                return false;
            }
            const observedAt = record.observation?.observedAt;
            const age = observedAt ? now - Date.parse(observedAt) : Number.POSITIVE_INFINITY;
            return !Number.isFinite(age) || age < 0 || age >= MIN_OBSERVATION_AGE_MS;
        });
        let next = 0;
        const worker = async () => {
            while (!this.#stopping && next < queue.length) {
                const record = queue[next++]!;
                try {
                    await this.#observe(record);
                } catch (error) {
                    if (error instanceof ProviderInstallationWorkflowError && error.code === "revision_conflict") {
                        continue;
                    }
                    this.#onError(safeError(error, record.installation.id));
                }
            }
        };
        await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_REPORTS, queue.length) }, () => worker()));
    }

    async #observe(record: StoredProviderInstallation): Promise<void> {
        const installation = record.installation;
        const response = await this.network.exchange({
            origin: installation.endpoint,
            pathAndQuery: PROVIDER_CONNECTION_PROTOCOL.report.path,
            method: PROVIDER_CONNECTION_PROTOCOL.report.method,
            headers: {},
            requestId: crypto.randomUUID(),
            siteId: this.siteId,
            installationId: installation.id,
            providerTokenRef: installation.providerTokenRef,
            invocationOrigin: "system",
            actorKind: "system",
            signal: AbortSignal.timeout(REPORT_TIMEOUT_MS),
            accept: "application/json",
        });
        if (
            response.redirected ||
            response.status !== 200 ||
            response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json"
        ) {
            throw new Error("invalid provider report response");
        }
        const bytes = await readBoundedReport(response);
        const report = parseProviderRuntimeReportJson(bytes);
        await this.installations.recordObservation(
            { siteId: installation.siteId, installationId: installation.id },
            record.revision,
            report,
        );
    }
}

async function readBoundedReport(response: Response): Promise<Uint8Array> {
    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error("provider report body is missing");
    }
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        length += value.byteLength;
        if (length > DEFAULT_PROVIDER_INSTALLATION_LIMITS.maxDocumentBytes) {
            await reader.cancel().catch(() => undefined);
            throw new Error("provider report is too large");
        }
        chunks.push(value);
    }
    const result = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return result;
}

function safeError(error: unknown, installationId?: string): Error {
    const candidate = error && typeof error === "object" && "code" in error ? error.code : undefined;
    const code =
        typeof candidate === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(candidate) ? candidate : "request_failed";
    return new Error(`Provider observation ${code}${installationId ? ` for ${installationId}` : ""}`);
}
