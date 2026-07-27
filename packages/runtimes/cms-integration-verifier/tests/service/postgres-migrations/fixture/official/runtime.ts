import {
    CmsSourceBindingMigrationHandler,
    CmsSourceFunctionalMigrationProbe,
    ProductionIntegrationMigrationRuntime,
    type IntegrationImportDeps,
    type IntegrationInstallationRepository,
    type IntegrationMigrationPhase,
    type IntegrationMigrationRuntime,
    type IntegrationMigrationStepContext,
} from "@bernouy/cms-integrations";
import {
    ConfiguredSupabaseConnectorMigrationAdapter,
    ConfiguredSupabaseFunctionMigrationHandler,
    type ConfiguredSupabaseMigrationServicesConfig,
} from "@bernouy/cms-integrations/supabase";
import { OFFICIAL_SUPABASE_PROJECT_REF, type RealPostgresSupabaseManagementApi } from "./managementApi";

const ACCESS_TOKEN = "official-photo-albums-test-token";

export function officialSupabaseMigrationConfig(
    management: RealPostgresSupabaseManagementApi,
): ConfiguredSupabaseMigrationServicesConfig {
    return {
        providerRepository: {
            async get(provider) {
                return provider === "supabase"
                    ? { provider, enabled: true, projectRef: OFFICIAL_SUPABASE_PROJECT_REF }
                    : null;
            },
            async upsert(provider) {
                return provider;
            },
        },
        secrets: {
            async get() {
                return ACCESS_TOKEN;
            },
        },
        apiBaseUrl: "http://supabase-management.test",
        fetch: management.fetch,
    };
}

export function createTrackedOfficialMigrationRuntime(options: {
    installations: IntegrationInstallationRepository;
    management: RealPostgresSupabaseManagementApi;
    executionCounts: Map<IntegrationMigrationPhase, number>;
    failAfter?: IntegrationMigrationPhase;
}): IntegrationMigrationRuntime {
    const config = officialSupabaseMigrationConfig(options.management);
    const functionDeployment = new ConfiguredSupabaseFunctionMigrationHandler(config);
    const bindingDependencies = notApplicableBindingDependencies(options.installations);
    const cmsBinding = new CmsSourceBindingMigrationHandler(bindingDependencies);
    const production = new ProductionIntegrationMigrationRuntime({
        connectorAdapters: [new ConfiguredSupabaseConnectorMigrationAdapter(config)],
        functionDeployment,
        targetSmoke: new CmsSourceFunctionalMigrationProbe(bindingDependencies, "target"),
        cmsBinding,
        cmsSmoke: new CmsSourceFunctionalMigrationProbe(bindingDependencies, "stable"),
    });
    return new TrackedMigrationRuntime(production, options.executionCounts, options.failAfter);
}

export function officialManagementAccessToken(): string {
    return ACCESS_TOKEN;
}

class TrackedMigrationRuntime implements IntegrationMigrationRuntime {
    #failed = false;

    constructor(
        private readonly inner: IntegrationMigrationRuntime,
        private readonly executionCounts: Map<IntegrationMigrationPhase, number>,
        private readonly failAfter?: IntegrationMigrationPhase,
    ) {}

    async executeStep(context: IntegrationMigrationStepContext) {
        const result = await this.inner.executeStep(context);
        this.executionCounts.set(context.phase, (this.executionCounts.get(context.phase) ?? 0) + 1);
        if (!this.#failed && context.phase === this.failAfter) {
            this.#failed = true;
            throw new Error(`injected after remote success for ${context.phase}`);
        }
        return result;
    }

    async confirmStep(
        context: IntegrationMigrationStepContext,
        previous: { externalOperationId?: string; confirmationDigest?: string },
    ) {
        return await this.inner.confirmStep(context, previous);
    }

    async compensateStep(
        context: IntegrationMigrationStepContext,
        previous: { externalOperationId?: string; confirmationDigest?: string },
    ) {
        if (!this.inner.compensateStep) {
            throw new Error("production migration runtime has no compensation handler");
        }
        return await this.inner.compensateStep(context, previous);
    }
}

function notApplicableBindingDependencies(installations: IntegrationInstallationRepository): IntegrationImportDeps {
    const unexpected = async (): Promise<never> => {
        throw new Error("Photo Albums declares no CMS-mediated migration cutover");
    };
    return {
        installations,
        sources: { getSource: unexpected } as never,
        secrets: { get: unexpected } as never,
    };
}
