import { createLogger, type LoggerOptions } from "logging/core/logger";
import type { Logger, LogRecord } from "logging/interfaces/Logger";

export type MemoryLogger = Readonly<{
    logger: Logger;
    records: LogRecord[];
}>;

export function createMemoryLogger(options: Omit<LoggerOptions, "sink">): MemoryLogger {
    const records: LogRecord[] = [];
    return { logger: createLogger({ ...options, sink: (record) => records.push(record) }), records };
}
