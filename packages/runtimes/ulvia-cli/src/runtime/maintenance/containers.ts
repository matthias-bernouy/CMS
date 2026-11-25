import { runCommand } from "../process";
import { localServicesIdentity } from "../stack/orchestration/state";
import type { UlviaPaths } from "../paths";
/** Recovery must still stop owned containers when a partial restore removed Compose artifact files. */
export async function removeOwnedContainers(paths: UlviaPaths) {
    const result = await runCommand([
        "docker",
        "ps",
        "--all",
        "--filter",
        `label=com.docker.compose.project=${localServicesIdentity(paths).projectName}`,
        "--format",
        "{{.ID}}",
    ]);
    const ids = result.stdout.trim().split("\n").filter(Boolean);
    if (ids.length > 64 || ids.some((id) => !/^[a-f0-9]{12,64}$/u.test(id))) {
        throw new Error("Invalid owned-container inventory");
    }
    if (ids.length) {
        await runCommand(["docker", "stop", ...ids]);
        await runCommand(["docker", "rm", ...ids]);
    }
}
