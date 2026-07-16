/**
 * Supabase adapter of @bernouy/cms-integrations — composition roots only.
 */

export {
    SupabaseConnectorDeployer,
    type SupabaseConnectorDeployerConfig,
    type SupabaseConnectorFunctionSecrets,
} from "../default-implementation/SupabaseConnectorDeployer";
export {
    ConfiguredSupabaseConnectorDeployer,
    type ConfiguredSupabaseConnectorDeployerConfig,
} from "../default-implementation/ConfiguredSupabaseConnectorDeployer";
