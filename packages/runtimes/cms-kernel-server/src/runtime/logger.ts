import { isLogLevel, parseLogLevel, type Logger } from "@bernouy/logging";
import { createNodeLogger, isLogFormat, parseLogFormat } from "@bernouy/logging/node";
import { currentRequestLogAttributes } from "@bernouy/http-runner/observability";

export function createKernelLogger(environment: Record<string, string | undefined>): Logger {
    const development = environment.MODE === "DEV";
    const configuredLevel = environment.ULVIA_LOG_LEVEL?.trim();
    const configuredConsoleLevel = environment.ULVIA_LOG_CONSOLE_LEVEL?.trim();
    const configuredFormat = environment.ULVIA_LOG_FORMAT?.trim();
    const level = parseLogLevel(configuredLevel, development ? "debug" : "info");
    const logger = createNodeLogger({
        service: "cms-kernel",
        level,
        fileLevel: level,
        mirrorLevel: development ? parseLogLevel(configuredConsoleLevel, "info") : level,
        format: parseLogFormat(configuredFormat, development ? "pretty" : "json"),
        file: development ? environment.ULVIA_LOG_FILE?.trim() || undefined : undefined,
        includeErrorStack: true,
        context: currentRequestLogAttributes,
    });
    reportInvalidConfiguration(logger, configuredLevel, configuredConsoleLevel, configuredFormat);
    return logger;
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
