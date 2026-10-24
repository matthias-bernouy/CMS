import type { Logger } from "@bernouy/logging";
import { createConfiguredNodeLogger } from "@bernouy/logging/node";
import { currentRequestLogAttributes } from "@bernouy/http-runner/observability";

export function createProviderLogger(environment: Record<string, string | undefined>): Logger {
    const development = environment.MODE === "DEV";
    const configuredLevel = environment.ULVIA_LOG_LEVEL?.trim();
    const configuredConsoleLevel = environment.ULVIA_LOG_CONSOLE_LEVEL?.trim();
    const configuredFormat = environment.ULVIA_LOG_FORMAT?.trim();
    return createConfiguredNodeLogger({
        service: "ulvia-provider",
        configuration: {
            level: configuredLevel,
            consoleLevel: configuredConsoleLevel,
            format: configuredFormat,
        },
        defaults: {
            level: development ? "debug" : "info",
            ...(development ? { consoleLevel: "info" as const } : {}),
            format: development ? "pretty" : "json",
        },
        settingNames: LOG_SETTING_NAMES,
        file: environment.ULVIA_LOG_FILE?.trim() || undefined,
        includeErrorStack: true,
        context: currentRequestLogAttributes,
    });
}

const LOG_SETTING_NAMES = {
    level: "ULVIA_LOG_LEVEL",
    consoleLevel: "ULVIA_LOG_CONSOLE_LEVEL",
    format: "ULVIA_LOG_FORMAT",
} as const;
