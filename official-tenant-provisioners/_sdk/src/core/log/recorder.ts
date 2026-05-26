import type { Recorder } from "src/interfaces/Recorder";
import type { LogStore } from "src/interfaces/LogStore";
import type { LogInput, LogRecord } from "src/types/LogRecord";
import { LogInputSchema } from "src/core/schemas/logRecord";
import { isKnownEvent } from "src/core/log/eventCatalog";
import { stripSecrets } from "src/core/log/stripSecrets";
import { LOG_SCHEMA_VERSION } from "src/constants";
import { SdkError } from "src/core/errors";

export interface RecorderDeps {
    providerId: string;
    now:        () => number;        // epoch seconds
    store:      LogStore;
    /** Best-effort sampling for `kind: request` only. Default = keep all. */
    sampleRequest?: () => boolean;
}

/**
 * Standard Recorder (base.md §10). Validates synchronously (schema +
 * catalog) — an unknown `event` is a programming error and throws. Then:
 * `audit` → awaited (sync/durable, §10.4); `security`/`request` →
 * fire-and-forget (non-blocking, errors swallowed; `request` sampled).
 */
export function createRecorder(deps: RecorderDeps): Recorder {
    return {
        record(input: LogInput): Promise<void> {
            const parsed = LogInputSchema.safeParse(input);
            if (!parsed.success) throw new SdkError(`invalid LogInput: ${parsed.error.message}`);
            if (!isKnownEvent(input.event)) {
                throw new SdkError(`unknown log event "${input.event}" (not in catalog)`);
            }

            const rec: LogRecord = {
                ...input,
                ctx: input.ctx ? (stripSecrets(input.ctx) as Record<string, unknown>) : undefined,
                schemaVersion: LOG_SCHEMA_VERSION,
                providerId:    deps.providerId,
                ts:            new Date(deps.now() * 1000).toISOString(),
                requestId:     input.requestId ?? crypto.randomUUID(),
            };

            if (rec.kind === "audit") {
                return deps.store.append(rec);             // durable, awaited
            }
            if (rec.kind === "request" && deps.sampleRequest && !deps.sampleRequest()) {
                return Promise.resolve();                   // sampled out
            }
            void deps.store.append(rec).catch(() => {});    // best-effort
            return Promise.resolve();
        },
    };
}
