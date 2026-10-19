export const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];
export type LogAttributes = Readonly<Record<string, unknown>>;

export type LogError = Readonly<{
    name: string;
    message: string;
    stack?: string;
}>;

export type LogRecord = Readonly<{
    time: string;
    level: LogLevel;
    service: string;
    event: string;
    attributes?: Readonly<Record<string, unknown>>;
    error?: LogError;
}>;

export interface Logger {
    child(attributes: LogAttributes): Logger;
    isEnabled(level: LogLevel): boolean;
    log(level: LogLevel, event: string, attributes?: LogAttributes, error?: unknown): void;
    trace(event: string, attributes?: LogAttributes, error?: unknown): void;
    debug(event: string, attributes?: LogAttributes, error?: unknown): void;
    info(event: string, attributes?: LogAttributes, error?: unknown): void;
    warn(event: string, attributes?: LogAttributes, error?: unknown): void;
    error(event: string, attributes?: LogAttributes, error?: unknown): void;
    fatal(event: string, attributes?: LogAttributes, error?: unknown): void;
}
