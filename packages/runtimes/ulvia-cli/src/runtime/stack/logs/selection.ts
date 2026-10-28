import { LOG_LEVELS, type LogLevel, type LogRecord } from "@bernouy/logging";
import { isValidRequestId } from "@bernouy/http-runner/observability";

const DEV_LOG_SERVICES = ["edge", "provider", "repository"] as const;
const STABLE_IDENTIFIER = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
type LocalLogService = (typeof DEV_LOG_SERVICES)[number];

export type LogSelection = Readonly<{
    services: readonly LocalLogService[];
    level: LogLevel;
    requestId?: string;
    event?: string;
    follow: boolean;
    format: "pretty" | "json";
    stack: boolean;
}>;

export function parseSelection(args: readonly string[], usage = "ulvia logs"): LogSelection {
    const values = [...args];
    const first = values[0];
    const services: readonly LocalLogService[] =
        !first || first.startsWith("--") || first === "all"
            ? DEV_LOG_SERVICES
            : DEV_LOG_SERVICES.includes(first as LocalLogService)
              ? [values.shift() as LocalLogService]
              : fail(`Unknown log service: ${first}`, usage);
    if (first === "all") {
        values.shift();
    }
    let level: LogLevel = "trace";
    let requestId: string | undefined;
    let event: string | undefined;
    let follow = false;
    let format: LogSelection["format"] = "pretty";
    let stack = false;
    while (values.length > 0) {
        const flag = values.shift();
        if (flag === "--follow") {
            follow = true;
            continue;
        }
        if (flag === "--json") {
            format = "json";
            continue;
        }
        if (flag === "--stack") {
            stack = true;
            continue;
        }
        if (flag === "--level") {
            const value = values.shift() as LogLevel | undefined;
            if (!value || !LOG_LEVELS.includes(value)) {
                fail("--level requires trace, debug, info, warn, error, or fatal", usage);
            }
            level = value;
            continue;
        }
        if (flag === "--request-id") {
            requestId = values.shift()?.trim();
            if (!requestId || !isValidRequestId(requestId)) {
                fail("--request-id requires a canonical UUID v4", usage);
            }
            continue;
        }
        if (flag === "--event") {
            event = values.shift()?.trim();
            if (!event || !STABLE_IDENTIFIER.test(event)) {
                fail("--event requires a stable lowercase event name", usage);
            }
            continue;
        }
        fail(`Unknown logs option: ${flag}`, usage);
    }
    return { services, level, requestId, event, follow, format, stack };
}

export function formatRecord(record: LogRecord, selection: LogSelection): string {
    if (selection.format === "json") {
        return JSON.stringify(record);
    }
    const attributes = record.attributes ? ` ${JSON.stringify(record.attributes)}` : "";
    const error = record.error ? ` ${escapeControls(record.error.name)}: ${escapeControls(record.error.message)}` : "";
    const stack = selection.stack && record.error?.stack ? `\n${escapeStack(record.error.stack)}` : "";
    return `${record.time} ${record.level.toUpperCase()} ${record.service} ${record.event}${attributes}${error}${stack}`;
}

function escapeStack(value: string): string {
    return value.replace(
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/gu,
        (character) => `\\u${character.codePointAt(0)?.toString(16).padStart(4, "0")}`,
    );
}

function escapeControls(value: string): string {
    return value.replace(
        /[\u0000-\u001f\u007f-\u009f]/gu,
        (character) => `\\u${character.codePointAt(0)?.toString(16).padStart(4, "0")}`,
    );
}

function fail(message: string, usage: string): never {
    throw new Error(`${message}\nUsage: ${usage} [all | edge | provider | repository] [options]`);
}
