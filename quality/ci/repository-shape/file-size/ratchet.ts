export {
    countPhysicalLines,
    fileSizeException,
    findFileSizeViolations,
    isGovernedFile,
    MAX_FILE_LINES,
    TARGET_FILE_LINES,
} from "./policy";
export { loadBaselineLines, parseRenames, renamedSources, resolveFileSizeReference } from "./git";
export { loadCurrentLines } from "./runner";

import { runFileSizeRatchet } from "./runner";

if (import.meta.main) await runFileSizeRatchet();
