export {
    compareContractReleases,
    type CompatibilityIssue,
    type CompatibilityIssueCode,
    type ContractCompatibilityReport,
} from "ulvia-contracts/core/compatibility/compareContractReleases";
export {
    compareSemVer,
    semVerMajor,
    type VersionBump,
    versionBump,
    releaseChannel,
    isSemVerPrerelease,
    semVerReleaseTarget,
    type ReleaseChannel,
} from "ulvia-contracts/core/compatibility/semver";
export {
    compareVersionRanges,
    isVersionRangeSubset,
    parseVersionRange,
    satisfiesVersionRange,
    type VersionRangeChange,
} from "ulvia-contracts/core/compatibility/versionRange";
export { isCanonicalSemVer, isRepositoryIdentifier } from "ulvia-contracts/core/parsing/identifiers";
export { firstSchemaSubsetViolation } from "ulvia-contracts/core/compatibility/schemaAcceptance";
