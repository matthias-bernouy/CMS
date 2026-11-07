import { compileImplementations } from "@bernouy/ulvia-sdk/build";
import type { UlviaProviderFeatureServices } from "../../ports/index";
import { officialFeatureImplementations } from "./inventory";

let compilation: ReturnType<typeof compileImplementations<UlviaProviderFeatureServices>> | undefined;

/** Build-only compilation emits release claims and the serializable runtime artifact. */
export function compileOfficialFeatures() {
    return (compilation ??= compileImplementations(officialFeatureImplementations));
}
