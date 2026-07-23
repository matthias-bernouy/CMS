import { describe, expect, test } from "bun:test";
import { controlCmsAccessors } from "cms-control/core/admin/control/accessors";
import type { ControlCmsState } from "cms-control/core/admin/control/types";

describe("ControlCms accessor delegation", () => {
    test("maps every directly injected dependency without substitution", () => {
        const dependency = {};
        const configuration = {
            integrationConnectorDeployers: dependency,
            integrationProvisioners: dependency,
        };
        const state = {
            configuration,
            repository: dependency,
            auth: dependency,
            runner: dependency,
            cache: dependency,
            secrets: dependency,
            roles: dependency,
            integrationCatalog: dependency,
            dashboards: dependency,
            relations: dependency,
            functions: dependency,
            triggers: dependency,
            identities: dependency,
            sourceOverlays: dependency,
            integrationInstallations: dependency,
            integrationConnectorProviders: dependency,
            integrationBlocRepository: dependency,
        } as unknown as ControlCmsState;

        const expectations = [
            ["config", configuration],
            ["repository", dependency],
            ["auth", dependency],
            ["runner", dependency],
            ["cache", dependency],
            ["secrets", dependency],
            ["roles", dependency],
            ["integrationCatalog", dependency],
            ["dashboards", dependency],
            ["relations", dependency],
            ["functions", dependency],
            ["triggers", dependency],
            ["identities", dependency],
            ["sourceOverlays", dependency],
            ["configuredIntegrationInstallations", dependency],
            ["integrationConnectorDeployers", dependency],
            ["integrationProvisioners", dependency],
            ["integrationConnectorProviders", dependency],
            ["integrationBlocRepository", dependency],
        ] as const;

        for (const [name, expected] of expectations) {
            expect((controlCmsAccessors[name] as (value: ControlCmsState) => unknown)(state)).toBe(expected);
        }
    });
});
