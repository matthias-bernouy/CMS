/**
 * Mongo adapter of @bernouy/cms-gateway — imported by composition roots only,
 * never by surfaces or libs that just consume the `GatewayRepository` contract.
 */

export { MongoGatewayRepository, type MongoGatewayRepositoryConfig } from "../default-implementation/MongoGatewayRepository";
