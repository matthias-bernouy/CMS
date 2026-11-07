import type { FeatureErrorMapper } from "@bernouy/ulvia-sdk";
import { CmsFilesError } from "cms-files/core/credentials";
export const mapFilesError: FeatureErrorMapper = (cause, capability) => {
    const candidate = cause instanceof CmsFilesError ? cause.code : "CORE_UNAVAILABLE";
    const code = Object.hasOwn(capability.errors, candidate) ? candidate : "CORE_UNAVAILABLE";
    return { code, output: { message: "The Files service could not complete the request." } };
};
