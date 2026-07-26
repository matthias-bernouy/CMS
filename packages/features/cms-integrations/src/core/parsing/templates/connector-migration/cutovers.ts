import type { DeclarativeConnectorMigrationPlan } from "../../../../interfaces/IntegrationConnectorDeployer";
import {
    assertRequiredMigrationKeys,
    invalidMigrationValue,
    migrationArray,
    migrationRecord,
    parseMigrationDuration,
    parseMigrationId,
} from "./values";

export function parseCmsMediatedCutover(
    value: unknown,
    name: string,
): NonNullable<DeclarativeConnectorMigrationPlan["cmsMediated"]> {
    const input = migrationRecord(value, name);
    assertRequiredMigrationKeys(input, ["strategy"], name, ["drainSeconds"]);
    if (input.strategy !== "binding-switch") {
        invalidMigrationValue(`${name}.strategy`, 'must be "binding-switch"');
    }
    return {
        strategy: "binding-switch",
        ...(input.drainSeconds === undefined
            ? {}
            : { drainSeconds: parseMigrationDuration(input.drainSeconds, `${name}.drainSeconds`) }),
    };
}

export function parseProviderDirectCutover(
    value: unknown,
    name: string,
): NonNullable<DeclarativeConnectorMigrationPlan["providerDirect"]> {
    const input = migrationRecord(value, name);
    assertRequiredMigrationKeys(input, ["strategy", "callbackIds"], name, ["drainSeconds"]);
    if (input.strategy !== "expand-in-code" && input.strategy !== "journalled-provider-switch") {
        invalidMigrationValue(`${name}.strategy`, 'must be "expand-in-code" or "journalled-provider-switch"');
    }
    const callbackIds = migrationArray(input.callbackIds, `${name}.callbackIds`).map((entry, index) =>
        parseMigrationId(entry, `${name}.callbackIds.${index}`),
    );
    if (!callbackIds.length || new Set(callbackIds).size !== callbackIds.length) {
        invalidMigrationValue(`${name}.callbackIds`, "must contain unique callback ids");
    }
    return {
        strategy: input.strategy,
        callbackIds,
        ...(input.drainSeconds === undefined
            ? {}
            : { drainSeconds: parseMigrationDuration(input.drainSeconds, `${name}.drainSeconds`) }),
    };
}
