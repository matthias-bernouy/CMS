import { compileImplementations } from "@bernouy/ulvia-sdk/build";
import type { UlviaProviderFeatureServices } from "../../ports/index";
import { smtpEmailerImplementation } from "./emailer";

/** One inventory drives generated releases, manifest claims and runtime mounting. */
export const officialFeatureImplementations = Object.freeze([smtpEmailerImplementation]);

let compilation: ReturnType<typeof compileImplementations<UlviaProviderFeatureServices>> | undefined;

/** One immutable compilation per process supplies release claims and runtime handlers. */
export function compileOfficialFeatures() {
    return (compilation ??= compileImplementations(officialFeatureImplementations));
}
