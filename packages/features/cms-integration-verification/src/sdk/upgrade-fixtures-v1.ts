import { assertIntegrationPackageKind } from "@bernouy/cms-integration-packages";
import { isSupportedIntegrationVersionRange } from "@bernouy/cms-integrations";
import type { VerificationObject, VerificationQuery, VerificationValue } from "./v1";

export const UPGRADE_FIXTURE_SUITE_SCHEMA_V1 = "ulvia.upgrade-fixtures.v1" as const;

export type UpgradeFixtureHttpResponseV1 = Readonly<{
    status: number;
    ok: boolean;
    body: VerificationValue;
}>;

export type UpgradeFixtureJsonRequestV1 = Readonly<{
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    headers?: Readonly<Record<string, string>>;
    body?: VerificationValue;
}>;

export type UpgradeFixtureContextV1 = Readonly<{
    kind: string;
    baselineVersion: string;
    targetVersion: string;
    stage: "before-upgrade" | "after-upgrade";
    database: Readonly<{ query: VerificationQuery }>;
    cms: Readonly<{
        request(path: string, request?: UpgradeFixtureJsonRequestV1): Promise<UpgradeFixtureHttpResponseV1>;
    }>;
    auth: Readonly<{
        createUser(
            input: Readonly<{ email: string; password?: string; appMetadata?: VerificationObject }>,
        ): Promise<Readonly<{ id: string; email: string }>>;
    }>;
    storage: Readonly<{
        ensureBucket(bucket: string, options?: Readonly<{ public?: boolean }>): Promise<void>;
        upload(bucket: string, path: string, bytes: Uint8Array, contentType: string): Promise<void>;
        exists(bucket: string, path: string): Promise<boolean>;
        download(bucket: string, path: string): Promise<Uint8Array>;
    }>;
    functions: Readonly<{
        invoke(slug: string, body?: VerificationValue): Promise<UpgradeFixtureHttpResponseV1>;
    }>;
}>;

export type UpgradeFixtureDependencyV1 = Readonly<{
    kind: string;
    versionRange?: string;
}>;

export type UpgradeFixtureScenarioV1<State extends VerificationValue = VerificationValue> = Readonly<{
    name: string;
    from: string;
    dependencies?: readonly UpgradeFixtureDependencyV1[];
    seedBeforeUpgrade(context: UpgradeFixtureContextV1): State | Promise<State>;
    assertAfterUpgrade(context: UpgradeFixtureContextV1, state: State): void | Promise<void>;
}>;

export type UpgradeFixtureSuiteV1 = Readonly<{
    schema: typeof UPGRADE_FIXTURE_SUITE_SCHEMA_V1;
    scenarios: readonly UpgradeFixtureScenarioV1[];
}>;

export function defineUpgradeScenario<State extends VerificationValue>(
    scenario: UpgradeFixtureScenarioV1<State>,
): UpgradeFixtureScenarioV1<State> {
    validateScenario(scenario);
    return Object.freeze({ ...scenario, dependencies: freezeDependencies(scenario.dependencies) });
}

export function defineUpgradeScenarios(input: UpgradeFixtureSuiteV1): UpgradeFixtureSuiteV1 {
    if (input?.schema !== UPGRADE_FIXTURE_SUITE_SCHEMA_V1 || !Array.isArray(input.scenarios)) {
        throw new TypeError(`Upgrade fixture suite must use schema ${UPGRADE_FIXTURE_SUITE_SCHEMA_V1}`);
    }
    if (Object.keys(input).some((field) => field !== "schema" && field !== "scenarios")) {
        throw new TypeError("Upgrade fixture suite contains an unsupported field");
    }
    if (input.scenarios.length === 0 || input.scenarios.length > 32) {
        throw new TypeError("Upgrade fixture suite must contain between 1 and 32 scenarios");
    }
    const scenarios = input.scenarios.map((scenario) => defineUpgradeScenario(scenario));
    const names = scenarios.map((scenario) => scenario.name);
    if (new Set(names).size !== names.length) {
        throw new TypeError("Upgrade fixture scenario names must be unique");
    }
    return Object.freeze({ schema: input.schema, scenarios: Object.freeze(scenarios) });
}

function validateScenario(scenario: UpgradeFixtureScenarioV1): void {
    const fields = Object.keys(scenario ?? {});
    if (
        fields.some(
            (field) => !["name", "from", "dependencies", "seedBeforeUpgrade", "assertAfterUpgrade"].includes(field),
        )
    ) {
        throw new TypeError("Upgrade fixture scenario contains an unsupported field");
    }
    if (!scenario || typeof scenario.name !== "string" || !scenario.name.trim() || scenario.name.length > 160) {
        throw new TypeError("Upgrade fixture scenario name must be non-empty and bounded");
    }
    if (typeof scenario.from !== "string" || !isSupportedIntegrationVersionRange(scenario.from)) {
        throw new TypeError("Upgrade fixture scenario from must be a supported SemVer range");
    }
    if (typeof scenario.seedBeforeUpgrade !== "function" || typeof scenario.assertAfterUpgrade !== "function") {
        throw new TypeError("Upgrade fixture scenario must declare both lifecycle hooks");
    }
    freezeDependencies(scenario.dependencies);
}

function freezeDependencies(
    dependencies: readonly UpgradeFixtureDependencyV1[] | undefined,
): readonly UpgradeFixtureDependencyV1[] | undefined {
    if (dependencies === undefined) {
        return undefined;
    }
    if (!Array.isArray(dependencies) || dependencies.length > 16) {
        throw new TypeError("Upgrade fixture dependencies must be a bounded array");
    }
    const frozen = Object.freeze(
        dependencies.map((dependency) => {
            const fields = Object.keys(dependency ?? {});
            if (fields.some((field) => field !== "kind" && field !== "versionRange")) {
                throw new TypeError("Upgrade fixture dependency contains an unsupported field");
            }
            if (!dependency || typeof dependency !== "object") {
                throw new TypeError("Upgrade fixture dependency must be an object");
            }
            assertIntegrationPackageKind(dependency.kind);
            if (dependency.versionRange && !isSupportedIntegrationVersionRange(dependency.versionRange)) {
                throw new TypeError("Upgrade fixture dependency versionRange must be a supported SemVer range");
            }
            return Object.freeze({ ...dependency });
        }),
    );
    if (new Set(frozen.map((dependency) => dependency.kind)).size !== frozen.length) {
        throw new TypeError("Upgrade fixture dependency kinds must be unique");
    }
    return frozen;
}
