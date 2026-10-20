import { isLogLevel, parseLogLevel } from "logging/core/logger";
import type { Logger, LogLevel } from "logging/interfaces/Logger";
import { createNodeLogger, isLogFormat, parseLogFormat, type LogFormat, type NodeLoggerOptions } from "./nodeLogger";

export type TextLoggerConfiguration = Readonly<{
    level?: string;
    consoleLevel?: string;
    format?: string;
}>;

export type ConfiguredNodeLoggerOptions = Omit<NodeLoggerOptions, "level" | "fileLevel" | "mirrorLevel" | "format"> &
    Readonly<{
        configuration: TextLoggerConfiguration;
        defaults: Readonly<{ level: LogLevel; consoleLevel?: LogLevel; format: LogFormat }>;
        settingNames?: Partial<Record<keyof TextLoggerConfiguration, string>>;
        reportInvalidConfiguration?: boolean;
    }>;

export function createConfiguredNodeLogger(options: ConfiguredNodeLoggerOptions): Logger {
    const { configuration, defaults, settingNames, reportInvalidConfiguration = true, ...loggerOptions } = options;
    const level = parseLogLevel(configuration.level, defaults.level);
    const logger = createNodeLogger({
        ...loggerOptions,
        level,
        fileLevel: level,
        mirrorLevel: parseLogLevel(configuration.consoleLevel, defaults.consoleLevel ?? level),
        format: parseLogFormat(configuration.format, defaults.format),
    });
    if (reportInvalidConfiguration) {
        reportInvalid(logger, configuration, settingNames);
    }
    return logger;
}

function reportInvalid(
    logger: Logger,
    configuration: TextLoggerConfiguration,
    settingNames: ConfiguredNodeLoggerOptions["settingNames"],
): void {
    for (const [setting, value, valid] of [
        ["level", configuration.level, isLogLevel(configuration.level)],
        ["consoleLevel", configuration.consoleLevel, isLogLevel(configuration.consoleLevel)],
        ["format", configuration.format, isLogFormat(configuration.format)],
    ] as const) {
        if (value && !valid) {
            logger.warn("logging.configuration.invalid", { setting: settingNames?.[setting] ?? setting });
        }
    }
}
