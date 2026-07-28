/**
 * HTTP adapter of @bernouy/cms-integrations — composition roots only.
 */

export {
    DEFAULT_INTEGRATION_REPOSITORY_TIMEOUT_MS,
    HttpIntegrationDefinitionRepository,
    type HttpIntegrationDefinitionRepositoryConfig,
} from "../default-implementation/http-definition/HttpIntegrationDefinitionRepository";
export { MAX_INTEGRATION_REPOSITORY_RESPONSE_BYTES } from "../default-implementation/http-definition/httpDefinitionBody";
