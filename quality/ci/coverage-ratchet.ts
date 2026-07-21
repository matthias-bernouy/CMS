export {
    assertBaselineUpdateAllowed,
    assertEveryPackageHasTests,
    normalizeCoverageReference,
    resolveCoverageReference,
} from "./coverage/policy";
export {
    compareCoverageBaselines,
    compareExactPackageCoverage,
    comparePackageCoverage,
    isCoverageRegression,
} from "./coverage/comparison";
export {
    isPackageRemovalAllowed,
    parseRemovedOrRenamedPaths,
    parseRenamedSourcesByDestination,
} from "./coverage/git";
export { parseLcov } from "./coverage/lcov";
export type {
    CoverageBaseline,
    CoverageMetric,
    CoveragePackage,
    PackageCoverage,
} from "./coverage/types";

import { runCoverageRatchet } from "./coverage/runner";

if (import.meta.main) await runCoverageRatchet();
