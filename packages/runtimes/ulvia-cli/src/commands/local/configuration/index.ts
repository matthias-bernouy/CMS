import { readDeploymentState } from "../../../runtime/stack/orchestration/state";
import {
    assertFreshInstallation,
    defaultInstallationConfig,
    loadInstallationConfig,
    saveInstallationConfig,
} from "../../../runtime/stack/installation";
import { sameConfiguration } from "../../../runtime/stack/orchestration/deployment/apply";
import { configuredInstallation, configureOptions, CONFIGURE_USAGE } from "./options";
import { promptConfiguration } from "./prompt";
import type { UlviaPaths } from "../../../runtime/paths";

export async function configureCommand(
    args: readonly string[],
    paths: UlviaPaths,
    environment: Record<string, string | undefined>,
    log: (line: string) => void,
): Promise<void> {
    if (args.length === 1 && ["--help", "-h"].includes(args[0]!)) {
        log(CONFIGURE_USAGE);
        return;
    }
    const state = await readDeploymentState(paths);
    const saved = await loadInstallationConfig(paths);
    const current = saved ?? defaultInstallationConfig(environment);
    if (args.length === 1 && args[0] === "--show") {
        log(
            JSON.stringify(
                {
                    configuration: current,
                    applied: state?.applied ? sameConfiguration(current, state.applied.installation) : false,
                },
                null,
                2,
            ),
        );
        return;
    }
    if (state?.operation) {
        throw new Error(`Deployment is pending. Run ulvia ${state.operation.kind} before editing configuration`);
    }
    if (!saved) {
        await assertFreshInstallation(paths);
    }
    const values = configureOptions(args.length ? args : await promptConfiguration(current, Boolean(state)));
    const next = configuredInstallation(current, values, Boolean(state));
    await saveInstallationConfig(paths, next);
    log(`Control: ${next.hosting.controlOrigin}`);
    log(`Shared Edges: ${next.hosting.edgeCount}`);
    log(
        state?.applied && sameConfiguration(next, state.applied.installation)
            ? "Configuration is already applied."
            : "Configuration saved. Run ulvia apply to deploy it.",
    );
}
