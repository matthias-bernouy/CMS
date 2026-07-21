export {
    countPhysicalLines,
    fileSizeException,
    findFileSizeViolations,
    isGovernedFile,
    MAX_FILE_LINES,
    TARGET_FILE_LINES,
} from "./file-size/policy";
export { loadBaselineLines, parseRenames, renamedSources, resolveFileSizeReference } from "./file-size/git";
export { loadCurrentLines } from "./file-size/runner";

import { runFileSizeRatchet } from "./file-size/runner";

if (import.meta.main) await runFileSizeRatchet();
