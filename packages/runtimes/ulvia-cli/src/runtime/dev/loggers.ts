import { join } from "node:path";
import { createConfiguredNodeLogger } from "@bernouy/logging/node";
import { currentRequestLogAttributes } from "@bernouy/http-runner/observability";
import type { UlviaPaths } from "../paths";

export function createDevLoggers(paths: UlviaPaths, environment: Record<string, string | undefined> = process.env) {
    const configuredLevel = environment.ULVIA_LOG_LEVEL?.trim();
    const configuredConsoleLevel = environment.ULVIA_LOG_CONSOLE_LEVEL?.trim();
    const configuredFormat = environment.ULVIA_LOG_FORMAT?.trim();
    const configuration = {
        level: configuredLevel,
        consoleLevel: configuredConsoleLevel,
        format: configuredFormat,
    };
    const supervisor = createDevLogger("ulvia-dev", join(paths.logs, "supervisor.ndjson"), configuration, true);
    const repository = createDevLogger(
        "official-repository",
        join(paths.logs, "repository.ndjson"),
        configuration,
        false,
    );
    return Object.freeze({ supervisor, repository });
}

function createDevLogger(
    service: string,
    file: string,
    configuration: Readonly<{ level?: string; consoleLevel?: string; format?: string }>,
    reportInvalidConfiguration: boolean,
) {
    return createConfiguredNodeLogger({
        service,
        configuration,
        defaults: { level: "debug", consoleLevel: "info", format: "pretty" },
        settingNames: LOG_SETTING_NAMES,
        reportInvalidConfiguration,
        file,
        includeErrorStack: true,
        context: currentRequestLogAttributes,
    });
}

const LOG_SETTING_NAMES = {
    level: "ULVIA_LOG_LEVEL",
    consoleLevel: "ULVIA_LOG_CONSOLE_LEVEL",
    format: "ULVIA_LOG_FORMAT",
} as const;
