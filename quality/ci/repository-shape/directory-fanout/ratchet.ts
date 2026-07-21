export { listBaselinePaths, resolveDirectoryFanoutReference } from "./git";
export {
    collectDirectoryEntries,
    findDirectoryFanoutViolations,
    MAX_DIRECTORY_ENTRIES,
    TARGET_DIRECTORY_ENTRIES,
} from "./policy";
export { inferPureDirectoryRenames } from "./renames";
export { listExistingCurrentPaths, loadBaselineDirectoryEntries, loadCurrentDirectoryEntries } from "./runner";

import { runDirectoryFanoutRatchet } from "./runner";

if (import.meta.main) await runDirectoryFanoutRatchet();
