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
export { SUPABASE_SQL_BUNDLE_LIMITS } from "../default-implementation/supabase/sql/constants";
export {
    loadSupabaseSqlBundle,
    loadSupabaseSqlSchemas,
    type LoadedSupabaseSqlSchema,
} from "../default-implementation/supabase/sql/schemaLoader";
