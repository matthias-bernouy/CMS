/**
 * Mongo adapter of @bernouy/cms-integrations — composition roots only.
 */

export {
    MongoIntegrationInstallationRepository,
    type MongoIntegrationInstallationRepositoryConfig,
} from "../default-implementation/MongoIntegrationInstallationRepository";
export {
    MongoIntegrationConnectorProviderRepository,
    type MongoIntegrationConnectorProviderRepositoryConfig,
} from "../default-implementation/MongoIntegrationConnectorProviderRepository";
