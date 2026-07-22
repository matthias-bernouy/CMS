/**
 * Mongo adapter of @bernouy/cms-integrations — composition roots only.
 */

export {
    MongoIntegrationInstallationRepository,
    type MongoIntegrationInstallationRepositoryConfig,
} from "../default-implementation/installations/MongoIntegrationInstallationRepository";
export {
    MongoIntegrationConnectorProviderRepository,
    type MongoIntegrationConnectorProviderRepositoryConfig,
} from "../default-implementation/connector-providers/MongoIntegrationConnectorProviderRepository";
