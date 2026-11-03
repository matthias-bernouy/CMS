import { resolve } from "node:path";
import { runCommand } from "../../../src/runtime/process";
import {
    assertImageVersion,
    officialImageReference,
    parseOfficialImageInspection,
    type OfficialImageComponent,
} from "../../../src/runtime/stack/orchestration/images";
/** Verify local images; the actual CLI must create every installation and image pin from scratch. */
export async function prepareSmokeRuntimeImages(environment: Record<string, string | undefined>) {
    const root = resolve(import.meta.dir, "../../../../../..");
    const prebuilt = environment.ULVIA_SMOKE_IMAGE_VERSION?.trim();
    const version = prebuilt || "0.1.0-edge-smoke";
    assertImageVersion(version);
    if (!prebuilt) {
        await runCommand([process.execPath, "run", "infra/images/build.ts", "build", "--version", version, "all"], {
            cwd: root,
            inherit: true,
        });
    }
    const inspect = async (component: OfficialImageComponent) => {
        const reference = officialImageReference(component, version);
        const metadata = await runCommand(["docker", "image", "inspect", reference]);
        return parseOfficialImageInspection(metadata.stdout, component, version);
    };
    await Promise.all([inspect("provider"), inspect("edge")]);
    return version;
}
