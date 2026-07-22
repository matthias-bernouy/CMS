import { LOCAL_RUNTIME_PROFILES, runLocalCms } from "./CLI_dev";

/** Run the local site with production cache, bundle, and security behavior. */
export default async function CLI_preview(args: string[]) {
    return runLocalCms(args, LOCAL_RUNTIME_PROFILES.preview);
}
