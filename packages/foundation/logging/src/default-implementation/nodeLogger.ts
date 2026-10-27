import { createLogger, type LoggerOptions, type LogSink } from "logging/core/logger";
import { LOG_LEVELS, type Logger, type LogRecord } from "logging/interfaces/Logger";

export type LogFormat = "json" | "pretty";
export type NodeLoggerOptions = Omit<LoggerOptions, "sink"> & Readonly<{ format?: LogFormat }>;

export function createNodeLogger(options: NodeLoggerOptions): Logger {
    return createLogger({ ...options, sink: createNodeLogSink(options) });
}

/** Operator destination for collectors that already normalize and redact their records. */
export function createNodeLogSink(options: NodeLoggerOptions): LogSink {
    const threshold = LOG_LEVELS.indexOf(options.level ?? "info");
    return (record) => {
        if (LOG_LEVELS.indexOf(record.level) < threshold) {
            return;
        }
        const line = options.format === "pretty" ? formatPretty(record) : JSON.stringify(record);
        const target = record.level === "error" || record.level === "fatal" ? process.stderr : process.stdout;
        try {
            target.write(`${line}\n`);
        } catch {
            // A closed process stream must not affect application behavior.
        }
    };
}

function formatPretty(record: LogRecord): string {
    const attributes = record.attributes ? ` ${JSON.stringify(record.attributes)}` : "";
    const error = record.error ? ` ${escapeInline(record.error.name)}: ${escapeInline(record.error.message)}` : "";
    const stack = record.error?.stack ? `\n${escapeStack(record.error.stack)}` : "";
    return `${record.time} ${record.level.toUpperCase()} ${record.service} ${record.event}${attributes}${error}${stack}`;
}

function escapeInline(value: string): string {
    return value.replace(
        /[\u0000-\u001f\u007f-\u009f]/gu,
        (character) => `\\u${character.codePointAt(0)?.toString(16).padStart(4, "0")}`,
    );
}

function escapeStack(value: string): string {
    return value.replace(
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/gu,
        (character) => `\\u${character.codePointAt(0)?.toString(16).padStart(4, "0")}`,
    );
}
