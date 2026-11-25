import { expect } from "bun:test";
import { runCommand } from "../../../../src/runtime/process";
import { localServicesIdentity } from "../../../../src/runtime/stack/orchestration/state";
import type { UlviaPaths } from "../../../../src/runtime/paths";
import { historicalCommit, historicalVersion } from "./historical";
/** Live Docker inventory; disappearing --rm one-shot containers are an ordinary observation race. */
export function ownedContainers(paths: UlviaPaths, docker: string, targetVersion: string) {
    const identity = localServicesIdentity(paths);
    const list = async () => {
        const result = await runCommand([
            docker,
            "ps",
            "--all",
            "--filter",
            `label=com.docker.compose.project=${identity.projectName}`,
            "--format",
            "{{.ID}}",
        ]);
        const ids = result.stdout.trim().split("\n").filter(Boolean);
        if (ids.length > 64 || ids.some((id) => !/^[a-f0-9]{12,64}$/u.test(id))) {
            throw new Error("Invalid owned upgrade container inventory");
        }
        if (!ids.length) {
            return [];
        }
        const inspected = await runCommand([docker, "inspect", ...ids], { allowFailure: true });
        if (inspected.exitCode !== 0 && !/no such object/iu.test(inspected.stderr)) {
            throw new Error("Cannot inspect owned upgrade containers");
        }
        return JSON.parse(inspected.stdout);
    };
    return {
        list,
        async assert(name: "old" | "new") {
            for (const component of ["provider", "edge"]) {
                const row = (await list()).find(
                    (item: any) =>
                        item.Config.Labels["com.docker.compose.service"] ===
                        (component === "edge" ? "edge-1" : "provider"),
                );
                expect(row?.State.Running).toBe(true);
                const image = JSON.parse((await runCommand([docker, "image", "inspect", row.Image])).stdout)[0];
                expect(image.Config.Labels["org.opencontainers.image.version"]).toBe(
                    name === "old" ? historicalVersion : targetVersion,
                );
                if (name === "old") {
                    expect(image.Config.Labels["org.opencontainers.image.revision"]).toBe(historicalCommit);
                }
            }
        },
        async remove() {
            const rows = await list();
            if (rows.length) {
                await runCommand([docker, "rm", "--force", ...rows.map((row: any) => row.Id)]);
            }
            await runCommand([docker, "network", "rm", identity.privateNetwork, identity.instanceNetwork], {
                allowFailure: true,
            });
        },
    };
}
