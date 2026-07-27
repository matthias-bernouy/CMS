import type { DeclarativeConnectorMigrationPlan } from "../../../../interfaces/IntegrationConnectorDeployer";
import { assertMigrationChain, assertUniqueMigrationIds } from "./chain";
import { parseCmsMediatedCutover, parseProviderDirectCutover } from "./cutovers";
import {
    parseMigrationDescriptor,
    parseMigrationInstall,
    parseMigrationRepeatable,
    parseMigrationSources,
} from "./descriptors";
import { parseMigrationEquivalence } from "./equivalence";
import { assertMigrationKeys, invalidMigrationValue, migrationArray, migrationRecord } from "./values";

export function parseConnectorMigrationPlan(
    value: unknown,
    name: string,
    targetVersion?: string,
): DeclarativeConnectorMigrationPlan {
    const input = migrationRecord(value, name);
    assertMigrationKeys(
        input,
        [
            "install",
            "migrations",
            "repeatables",
            "supportedSources",
            "equivalence",
            "cmsMediated",
            "providerDirect",
            "pointOfNoReturn",
        ],
        name,
    );
    const install = parseMigrationInstall(input.install, `${name}.install`);
    const migrations = migrationArray(input.migrations, `${name}.migrations`).map((entry, index) =>
        parseMigrationDescriptor(entry, `${name}.migrations.${index}`),
    );
    const repeatables =
        input.repeatables === undefined
            ? []
            : migrationArray(input.repeatables, `${name}.repeatables`).map((entry, index) =>
                  parseMigrationRepeatable(entry, `${name}.repeatables.${index}`),
              );
    const supportedSources = parseMigrationSources(input.supportedSources, `${name}.supportedSources`);
    if (input.pointOfNoReturn !== "before-contract") {
        invalidMigrationValue(`${name}.pointOfNoReturn`, 'must be "before-contract"');
    }
    assertUniqueMigrationIds(migrations, `${name}.migrations`);
    assertUniqueMigrationIds(repeatables, `${name}.repeatables`);
    assertMigrationChain(install, migrations, supportedSources, name, targetVersion);
    return {
        install,
        migrations,
        ...(repeatables.length ? { repeatables } : {}),
        supportedSources,
        ...(input.equivalence === undefined
            ? {}
            : { equivalence: parseMigrationEquivalence(input.equivalence, `${name}.equivalence`) }),
        ...(input.cmsMediated === undefined
            ? {}
            : { cmsMediated: parseCmsMediatedCutover(input.cmsMediated, `${name}.cmsMediated`) }),
        ...(input.providerDirect === undefined
            ? {}
            : { providerDirect: parseProviderDirectCutover(input.providerDirect, `${name}.providerDirect`) }),
        pointOfNoReturn: "before-contract",
    };
}

export { validateMigrationAwareConnectorLayout } from "./validation";
