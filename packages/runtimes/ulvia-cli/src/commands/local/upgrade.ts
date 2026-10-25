import type { UlviaPaths } from "../../runtime/paths";
import { assertImageVersion, type OfficialImageComponent } from "../../runtime/stack/orchestration/images";
import { upgradeLocalService } from "../../runtime/stack/orchestration/services";
import { upgradeLocalKernels } from "../../runtime/stack/orchestration/upgrades";

export async function upgradeCommand(
    args: readonly string[],
    paths: UlviaPaths,
    log: (message: string) => void,
): Promise<void> {
    const component = parseComponent(args[0]);
    if (args.length !== 3 || args[1] !== "--version" || !args[2]) {
        throw new Error(usage());
    }
    const version = args[2];
    assertImageVersion(version);
    if (component === "kernel") {
        await upgradeLocalKernels(paths, version, log);
        return;
    }
    await upgradeLocalService(paths, component, version, log);
}

function parseComponent(value: string | undefined): OfficialImageComponent {
    if (value === "kernel" || value === "provider" || value === "repository") {
        return value;
    }
    throw new Error(usage());
}

function usage(): string {
    return "Usage: ulvia upgrade <kernel | provider | repository> --version <version>";
}
