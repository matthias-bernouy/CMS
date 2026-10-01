export {
    compareContractReleases,
    type CompatibilityIssue,
    type CompatibilityIssueCode,
    type ContractCompatibilityReport,
} from "cms-repository/contracts/core/compatibility/compareContractReleases";
export {
    compareSemVer,
    semVerMajor,
    type VersionBump,
    versionBump,
} from "cms-repository/contracts/core/compatibility/semver";
export {
    compareVersionRanges,
    isVersionRangeSubset,
    parseVersionRange,
    satisfiesVersionRange,
    type VersionRangeChange,
} from "cms-repository/contracts/core/compatibility/versionRange";
export { isCanonicalSemVer } from "cms-repository/contracts/core/parsing/identifiers";
