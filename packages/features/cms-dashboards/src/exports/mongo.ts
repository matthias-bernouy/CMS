/**
 * Mongo adapter of @bernouy/cms-dashboards — composition roots only.
 */

export {
    MongoDashboardRepository,
    type MongoDashboardRepositoryConfig,
} from "../default-implementation/MongoDashboardRepository";
export {
    MongoDashboardViewRepository,
    type MongoDashboardViewRepositoryConfig,
} from "../default-implementation/MongoDashboardViewRepository";
export {
    MongoDashboardAssignmentRepository,
    type MongoDashboardAssignmentRepositoryConfig,
} from "../default-implementation/MongoDashboardAssignmentRepository";
