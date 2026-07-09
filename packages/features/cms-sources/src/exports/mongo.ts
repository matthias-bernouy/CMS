/**
 * Mongo adapter of @bernouy/cms-sources — imported by composition roots only,
 * never by surfaces or libs that just consume the `SourceRepository` contract.
 */

export { MongoSourceRepository, type MongoSourceRepositoryConfig } from "../default-implementation/MongoSourceRepository";
export {
    MongoSourceOverlayRepository,
    type MongoSourceOverlayRepositoryConfig,
} from "../default-implementation/MongoSourceOverlayRepository";
