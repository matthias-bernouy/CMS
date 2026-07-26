/**
 * Supabase adapter of @bernouy/cms-integrations — composition roots only.
 */

export {
    SupabaseConnectorDeployer,
    type SupabaseConnectorDeployerConfig,
    type SupabaseConnectorFunctionSecrets,
} from "../default-implementation/supabase/SupabaseConnectorDeployer";
export {
    ConfiguredSupabaseConnectorDeployer,
    type ConfiguredSupabaseConnectorDeployerConfig,
} from "../default-implementation/ConfiguredSupabaseConnectorDeployer";
export { SUPABASE_FUNCTION_BUNDLE_LIMITS } from "../default-implementation/supabase/functionBundle";
export { SUPABASE_SQL_BUNDLE_LIMITS } from "../default-implementation/supabase/sql/constants";
export {
    loadSupabaseSqlBundle,
    loadSupabaseSqlSchemas,
    type LoadedSupabaseSqlSchema,
} from "../default-implementation/supabase/sql/schemaLoader";
export {
    readSupabaseObservedSchemaContract,
    type ReadSupabaseObservedSchemaContractOptions,
    type SupabaseSchemaCatalogQueryClient,
} from "../default-implementation/supabase/schema-observation";
export {
    ANONYMOUS_CONSTRAINT_LINT_LIMITS,
    lintAnonymousConstraints,
    type AnonymousConstraintFinding,
    type AnonymousConstraintLintLimits,
} from "../default-implementation/supabase/sql/anonymousConstraintLint";
export { SupabaseConnectorMigrationAdapter } from "../default-implementation/supabase/migration/executor";
export { SupabaseFunctionMigrationHandler } from "../default-implementation/supabase/migration/functions";
export {
    ConfiguredSupabaseConnectorMigrationAdapter,
    ConfiguredSupabaseFunctionMigrationHandler,
} from "../default-implementation/supabase/migration/production/runtime";
export { ConfiguredSupabaseConnectorBaselineAdopter } from "../default-implementation/supabase/migration/production/adopter";
export type { ConfiguredSupabaseMigrationServicesConfig } from "../default-implementation/supabase/migration/production/config";
export {
    computeSupabaseInstallDigest,
    loadSupabaseMigrationAssets,
    loadSupabaseRepeatableAssets,
    type LoadedSupabaseMigration,
    type LoadedSupabaseRepeatable,
} from "../default-implementation/supabase/migration/assets";
export {
    buildSupabaseFreshInstallSql,
    buildSupabaseMigrationPhaseSql,
} from "../default-implementation/supabase/migration/sql";
export {
    buildSupabaseBaselineAdoptionSql,
    confirmSupabaseBaselineAdoptionSql,
} from "../default-implementation/supabase/migration/production/adoptionSql";
