import { secretsImplementation } from "./secrets";
import { smtpEmailerImplementation } from "./emailer";

/** One inventory drives generated releases, manifest claims and runtime mounting. */
export const officialFeatureImplementations = Object.freeze([smtpEmailerImplementation, secretsImplementation]);
