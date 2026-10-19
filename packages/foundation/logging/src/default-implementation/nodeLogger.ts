import { appendFileSync, chmodSync, mkdirSync, renameSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { createLogger, type LoggerOptions } from "logging/core/logger";
import { LOG_LEVELS, type Logger, type LogLevel, type LogRecord } from "logging/interfaces/Logger";

export type LogFormat = "json" | "pretty";

export type NodeLoggerOptions = Omit<LoggerOptions, "sink"> &
    Readonly<{
        format?: LogFormat;
        file?: string;
        fileLevel?: LogLevel;
        mirror?: boolean;
        mirrorLevel?: LogLevel;
        maxFileBytes?: number;
        retainedFiles?: number;
    }>;

export function createNodeLogger(options: NodeLoggerOptions): Logger {
    const format = options.format ?? "json";
    const mirror = options.mirror ?? true;
    const defaultLevel = options.level ?? "info";
    const fileLevel = options.fileLevel ?? defaultLevel;
    const mirrorLevel = options.mirrorLevel ?? defaultLevel;
    let file = options.file;
    const maxFileBytes = options.maxFileBytes ?? 5 * 1024 * 1024;
    const retainedFiles = options.retainedFiles ?? 3;
    if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1) {
        throw new RangeError("Node logger maxFileBytes must be a positive safe integer");
    }
    if (!Number.isSafeInteger(retainedFiles) || retainedFiles < 1) {
        throw new RangeError("Node logger retainedFiles must be a positive safe integer");
    }
    if (file) {
        try {
            mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
            touchPrivate(file);
        } catch (error) {
            writeEmergencyFailure(options.service, error);
            file = undefined;
        }
    }
    let fileFailureReported = false;
    const activeThresholds = [file ? fileLevel : undefined, mirror ? mirrorLevel : undefined].filter(
        (level): level is LogLevel => level !== undefined,
    );
    const level = activeThresholds.length
        ? activeThresholds.reduce((lowest, candidate) =>
              levelIndex(candidate) < levelIndex(lowest) ? candidate : lowest,
          )
        : defaultLevel;
    return createLogger({
        ...options,
        level,
        sink: (record) => {
            let serialized: string | undefined;
            const serialize = () => {
                serialized ??= JSON.stringify(record);
                return serialized;
            };
            if (file && isEnabled(record.level, fileLevel)) {
                try {
                    rotateIfNeeded(file, maxFileBytes, retainedFiles);
                    appendFileSync(file, `${serialize()}\n`, { encoding: "utf8", mode: 0o600 });
                    fileFailureReported = false;
                } catch (error) {
                    if (!fileFailureReported) {
                        fileFailureReported = true;
                        writeEmergencyFailure(options.service, error);
                    }
                }
            }
            if (mirror && isEnabled(record.level, mirrorLevel)) {
                const line = format === "json" ? serialize() : formatPretty(record);
                const target = record.level === "error" || record.level === "fatal" ? process.stderr : process.stdout;
                try {
                    target.write(`${line}\n`);
                } catch {
                    // A closed process stream must not affect application behavior.
                }
            }
        },
    });
}

export function parseLogFormat(value: string | undefined, fallback: LogFormat = "pretty"): LogFormat {
    const normalized = value?.trim().toLowerCase();
    return normalized === "json" || normalized === "pretty" ? normalized : fallback;
}

export function isLogFormat(value: string | undefined): boolean {
    const normalized = value?.trim().toLowerCase();
    return normalized === "json" || normalized === "pretty";
}

function isEnabled(level: LogLevel, threshold: LogLevel): boolean {
    return levelIndex(level) >= levelIndex(threshold);
}

function levelIndex(level: LogLevel): number {
    return LOG_LEVELS.indexOf(level);
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

function touchPrivate(file: string): void {
    appendFileSync(file, "", { encoding: "utf8", mode: 0o600 });
    chmodSync(file, 0o600);
}

function rotateIfNeeded(file: string, maxBytes: number, retainedFiles: number): void {
    if (statSync(file).size < maxBytes) {
        return;
    }
    for (let index = retainedFiles - 1; index >= 1; index -= 1) {
        try {
            renameSync(`${file}.${index}`, `${file}.${index + 1}`);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                throw error;
            }
        }
    }
    renameSync(file, `${file}.1`);
    touchPrivate(file);
}

function writeEmergencyFailure(service: string, error: unknown): void {
    try {
        process.stderr.write(
            `${JSON.stringify({
                time: new Date().toISOString(),
                level: "error",
                service,
                event: "logging.file.failed",
                error: { name: error instanceof Error ? error.name : "UnknownError" },
            })}\n`,
        );
    } catch {
        // No remaining diagnostic destination is available.
    }
}
