export {
    collectDirectoryEntries,
    findDirectoryFanoutFindings,
    TARGET_DIRECTORY_ENTRIES,
    WIDE_DIRECTORY_ENTRIES,
} from "./policy";
export { loadCurrentDirectoryEntries, runDirectoryFanoutCheck } from "./runner";

import { runDirectoryFanoutCheck } from "./runner";

if (import.meta.main) await runDirectoryFanoutCheck();
