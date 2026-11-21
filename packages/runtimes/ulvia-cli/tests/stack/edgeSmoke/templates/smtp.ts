import { expect } from "bun:test";
import { resolveUlviaPaths } from "../../../../src/runtime/paths";
import { readDeploymentState } from "../../../../src/runtime/stack/orchestration/state";
import { pinnedOfficialImageReference } from "../../../../src/runtime/stack/orchestration/images";
import { containerCluster } from "../../../../../../../tests/integration/instance/containers/cluster";
import { docker } from "../../../../../../../tests/integration/instance/docker";
import {
    buildSmtpProgram,
    startSmtpService,
} from "../../../../../../../tests/performance/harness/services/smtp/container";

/** Controlled synthetic-only mail sink; no real recipient or external SMTP server is contacted. */
export async function smokeSmtp(environment: Record<string, string | undefined>) {
    const state = await readDeploymentState(resolveUlviaPaths(environment));
    expect(state?.applied).toBeTruthy();
    const image = pinnedOfficialImageReference(state!.applied!.images.provider);
    const cluster = await containerCluster(image);
    try {
        const service = await startSmtpService(cluster, image, await buildSmtpProgram());
        await docker([
            "network",
            "connect",
            "--alias",
            "performance-smtp",
            state!.applied!.privateNetwork,
            `${cluster.id}-smtp`,
        ]);
        return { ...service, close: () => cluster.close() };
    } catch (error) {
        await cluster.close();
        throw error;
    }
}
