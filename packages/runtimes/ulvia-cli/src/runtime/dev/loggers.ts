import { join } from "node:path";
import { isLogLevel, parseLogLevel, type Logger, type LogLevel } from "@bernouy/logging";
import { createNodeLogger, isLogFormat, parseLogFormat, type LogFormat } from "@bernouy/logging/node";
import { currentRequestLogAttributes } from "@bernouy/http-runner/observability";
import type { UlviaPaths } from "../paths";

export function createDevLoggers(paths: UlviaPaths, environment: Record<string, string | undefined> = process.env) {
    const configuredLevel = environment.ULVIA_LOG_LEVEL?.trim();
    const configuredConsoleLevel = environment.ULVIA_LOG_CONSOLE_LEVEL?.trim();
    const configuredFormat = environment.ULVIA_LOG_FORMAT?.trim();
    const level = parseLogLevel(configuredLevel, "debug");
    const mirrorLevel = parseLogLevel(configuredConsoleLevel, "info");
    const format = parseLogFormat(configuredFormat, "pretty");
    const supervisor = createDevLogger("ulvia-dev", join(paths.logs, "supervisor.ndjson"), level, mirrorLevel, format);
    const repository = createDevLogger(
        "official-repository",
        join(paths.logs, "repository.ndjson"),
        level,
        mirrorLevel,
        format,
    );
    reportInvalidConfiguration(supervisor, configuredLevel, configuredConsoleLevel, configuredFormat);
    return Object.freeze({ supervisor, repository });
}

function createDevLogger(
    service: string,
    file: string,
    level: LogLevel,
    mirrorLevel: LogLevel,
    format: LogFormat,
): Logger {
    return createNodeLogger({
        service,
        level,
        fileLevel: level,
        mirrorLevel,
        format,
        file,
        includeErrorStack: true,
        context: currentRequestLogAttributes,
    });
}

function reportInvalidConfiguration(logger: Logger, level?: string, consoleLevel?: string, format?: string): void {
    if (level && !isLogLevel(level)) {
        logger.warn("logging.configuration.invalid", { setting: "ULVIA_LOG_LEVEL" });
    }
    if (consoleLevel && !isLogLevel(consoleLevel)) {
        logger.warn("logging.configuration.invalid", { setting: "ULVIA_LOG_CONSOLE_LEVEL" });
    }
    if (format && !isLogFormat(format)) {
        logger.warn("logging.configuration.invalid", { setting: "ULVIA_LOG_FORMAT" });
    }
}
