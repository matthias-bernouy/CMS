import { runDirectoryFanoutCheck } from "./directory-fanout/runner";
import { runFileSizeCheck } from "./file-size/runner";

await runFileSizeCheck();
await runDirectoryFanoutCheck();
