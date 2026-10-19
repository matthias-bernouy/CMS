import { LOG_LEVELS, type LogAttributes, type Logger, type LogLevel, type LogRecord } from "logging/interfaces/Logger";
import { sanitizeAttributes, sanitizeError } from "logging/core/sanitize";

export type LogSink = (record: LogRecord) => void;

export type LoggerOptions = Readonly<{
    service: string;
    level?: LogLevel;
    attributes?: LogAttributes;
    context?: () => LogAttributes | undefined;
    includeErrorStack?: boolean;
    now?: () => Date;
    sink: LogSink;
}>;

const EVENT_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const INVALID_EVENT = "logging.invalid-event";

export function createLogger(options: LoggerOptions): Logger {
    if (!EVENT_PATTERN.test(options.service)) {
        throw new TypeError("Logger service must be a stable lowercase identifier");
    }
    return new StructuredLogger(options, options.attributes ?? {});
}

export function parseLogLevel(value: string | undefined, fallback: LogLevel = "info"): LogLevel {
    const normalized = value?.trim().toLowerCase();
    return LOG_LEVELS.find((level) => level === normalized) ?? fallback;
}

export function isLogLevel(value: string | undefined): boolean {
    return LOG_LEVELS.some((level) => level === value?.trim().toLowerCase());
}

export const NOOP_LOGGER: Logger = Object.freeze({
    child: () => NOOP_LOGGER,
    isEnabled: () => false,
    log: () => undefined,
    trace: () => undefined,
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    fatal: () => undefined,
});

class StructuredLogger implements Logger {
    readonly #threshold: number;

    constructor(
        private readonly options: LoggerOptions,
        private readonly attributes: LogAttributes,
    ) {
        this.#threshold = LOG_LEVELS.indexOf(options.level ?? "info");
    }

    child(attributes: LogAttributes): Logger {
        return new StructuredLogger(this.options, { ...this.attributes, ...attributes });
    }

    isEnabled(level: LogLevel): boolean {
        return LOG_LEVELS.indexOf(level) >= this.#threshold;
    }

    log(level: LogLevel, event: string, attributes: LogAttributes = {}, error?: unknown): void {
        if (!this.isEnabled(level)) {
            return;
        }
        try {
            const normalizedEvent = EVENT_PATTERN.test(event) ? event : INVALID_EVENT;
            const merged = sanitizeAttributes({
                ...attributes,
                ...this.attributes,
                ...readContext(this.options.context),
                ...(normalizedEvent === INVALID_EVENT ? { invalidEvent: event } : {}),
            });
            const normalizedError = sanitizeError(error, this.options.includeErrorStack ?? false);
            this.options.sink(
                Object.freeze({
                    time: (this.options.now?.() ?? new Date()).toISOString(),
                    level,
                    service: this.options.service,
                    event: normalizedEvent,
                    ...(Object.keys(merged).length > 0 ? { attributes: merged } : {}),
                    ...(normalizedError ? { error: normalizedError } : {}),
                }),
            );
        } catch {
            // Diagnostics must never replace or interrupt application behavior.
        }
    }

    trace = (event: string, attributes?: LogAttributes, error?: unknown): void =>
        this.log("trace", event, attributes, error);
    debug = (event: string, attributes?: LogAttributes, error?: unknown): void =>
        this.log("debug", event, attributes, error);
    info = (event: string, attributes?: LogAttributes, error?: unknown): void =>
        this.log("info", event, attributes, error);
    warn = (event: string, attributes?: LogAttributes, error?: unknown): void =>
        this.log("warn", event, attributes, error);
    error = (event: string, attributes?: LogAttributes, error?: unknown): void =>
        this.log("error", event, attributes, error);
    fatal = (event: string, attributes?: LogAttributes, error?: unknown): void =>
        this.log("fatal", event, attributes, error);
}

function readContext(provider: LoggerOptions["context"]): LogAttributes {
    if (!provider) {
        return {};
    }
    try {
        return provider() ?? {};
    } catch {
        return {};
    }
}
