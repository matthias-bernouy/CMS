import { filesImplementation } from "./implementations/files";
import { secretsImplementation } from "./implementations/secrets";
import { smtpEmailerImplementation } from "./implementations/emailer";

/** One inventory drives generated releases, manifest claims and runtime mounting. */
export const officialFeatureImplementations = Object.freeze([
    smtpEmailerImplementation,
    secretsImplementation,
    filesImplementation,
]);
