export { FsIntegrationRegistryCandidateStoreError } from "./errors";
export {
    readIntegrationRegistryCandidateRecord,
    parseIntegrationRegistryCandidateRecord,
} from "./document";
export {
    recoverFsIntegrationRegistryCandidates,
    type FsIntegrationRegistryCandidateRecoveryDiagnostic,
    type FsIntegrationRegistryCandidateRecoveryResult,
    type RecoverFsIntegrationRegistryCandidatesConfig,
} from "./recovery";
export {
    FsIntegrationRegistryCandidateStore,
    type FsIntegrationRegistryCandidateStoreConfig,
} from "./store";
export type { FsIntegrationRegistryCandidateObjects } from "./objects";
