import { createLogger, type LogSink, type LoggerOptions } from "@bernouy/logging";
import { BufferedLogCollector } from "./BufferedLogCollector";
import { collectionEnabled } from "./collectionContext";
import { entryFromRecord } from "./entry";

export function createObservabilityLogger(options: Omit<LoggerOptions, "sink"> & { fallback: LogSink }) {
    const fallback = createLogger({ service: options.service, level: "trace", sink: options.fallback });
    const collector = new BufferedLogCollector(fallback);
    const logger = createLogger({
        ...options,
        sink: (record) => {
            if (!collectionEnabled()) {
                return;
            }
            options.fallback(record);
            collector.enqueue(entryFromRecord(record));
        },
    });
    return { logger, collector };
}
