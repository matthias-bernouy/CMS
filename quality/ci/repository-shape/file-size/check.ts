export {
    countPhysicalLines,
    fileSizeException,
    findFileSizeFindings,
    isGovernedFile,
    LARGE_FILE_LINES,
    TARGET_FILE_LINES,
} from "./policy";
export { loadCurrentLines, runFileSizeCheck } from "./runner";

import { runFileSizeCheck } from "./runner";

if (import.meta.main) {
    await runFileSizeCheck();
}
