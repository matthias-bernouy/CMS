import { runDirectoryFanoutRatchet } from "./directory-fanout/runner";
import { runFileSizeRatchet } from "./file-size/runner";

await runFileSizeRatchet();
await runDirectoryFanoutRatchet();
