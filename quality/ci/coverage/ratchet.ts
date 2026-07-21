export {
    assertBaselineUpdateAllowed,
    assertEveryPackageHasTests,
    normalizeCoverageReference,
    resolveCoverageReference,
} from "./policy/policy";
export {
    compareCoverageBaselines,
    compareExactPackageCoverage,
    comparePackageCoverage,
    isCoverageRegression,
} from "./policy/comparison";
export {
    isPackageRemovalAllowed,
    parseRemovedOrRenamedPaths,
    parseRenamedSourcesByDestination,
} from "./policy/git";
export { parseLcov } from "./measurement/lcov";
export type {
    CoverageBaseline,
    CoverageMetric,
    CoveragePackage,
    PackageCoverage,
} from "./types";

import { runCoverageRatchet } from "./runner";

if (import.meta.main) await runCoverageRatchet();
