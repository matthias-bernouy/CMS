import { createHash } from "node:crypto";
import type {
    IntegrationProvisionContext,
    IntegrationProvisionDeployment,
    IntegrationProvisioner,
    IntegrationProvisionResourceResult,
} from "../../interfaces/IntegrationImport";
import { StripeProvisioningClient } from "./client";
import { parseStripeWebhookConfiguration } from "./configuration";
import { deleteV1Webhook, provisionV1Webhook } from "./v1";
import { deleteV2Webhook, provisionV2Webhook } from "./v2";

export type StripeWebhookProvisionerConfig = {
    fetch?: typeof fetch;
    apiBaseUrl?: string;
    allowInsecureLoopbackWebhooks?: boolean;
};

export class StripeWebhookProvisioner implements IntegrationProvisioner {
    readonly provider = "stripe-webhooks";

    constructor(private readonly config: StripeWebhookProvisionerConfig = {}) {}

    async provision(deployment: IntegrationProvisionDeployment, context: IntegrationProvisionContext) {
        const configuration = parseStripeWebhookConfiguration(deployment, {
            allowInsecureLoopbackUrls: this.config.allowInsecureLoopbackWebhooks,
        });
        const client = new StripeProvisioningClient(
            configuration.secretKey,
            this.config.fetch ?? fetch,
            this.config.apiBaseUrl,
        );
        const outputs: Record<string, string> = {};
        const resources: IntegrationProvisionResourceResult[] = [];
        const created: Array<{ protocol: "v1" | "v2"; id: string }> = [];
        try {
            for (const destination of configuration.destinations) {
                const common = {
                    integrationKind: deployment.integrationKind,
                    owner: configuration.owner,
                    version: deployment.version ?? "unversioned",
                    existingSecret: context.existingOutputs[destination.name],
                    idempotencyKey: idempotencyKey(deployment, destination.name, destination.url),
                };
                const result =
                    destination.protocol === "v1"
                        ? await provisionV1Webhook(client, destination, {
                              ...common,
                              apiVersion: configuration.v1ApiVersion,
                          })
                        : await provisionV2Webhook(client, destination, {
                              ...common,
                              apiVersion: configuration.v2ApiVersion,
                          });
                outputs[destination.name] = result.secret;
                resources.push(result.resource);
                if (result.created) {
                    created.push({ protocol: destination.protocol, id: result.resource.id });
                }
            }
        } catch (error) {
            await rollbackCreated(client, configuration, created);
            throw error;
        }
        return {
            outputs,
            resources,
            rollback: () => rollbackCreated(client, configuration, created),
        };
    }
}

function idempotencyKey(deployment: IntegrationProvisionDeployment, name: string, url: string): string {
    const value = [deployment.integrationKind, deployment.version ?? "", name, url].join("\n");
    return `cmscore-webhook-${createHash("sha256").update(value).digest("hex")}`;
}

async function rollbackCreated(
    client: StripeProvisioningClient,
    configuration: ReturnType<typeof parseStripeWebhookConfiguration>,
    created: Array<{ protocol: "v1" | "v2"; id: string }>,
): Promise<void> {
    for (const resource of [...created].reverse()) {
        try {
            if (resource.protocol === "v1") {
                await deleteV1Webhook(client, configuration.v1ApiVersion, resource.id);
            } else {
                await deleteV2Webhook(client, configuration.v2ApiVersion, resource.id);
            }
        } catch {
            // Best-effort rollback: keep deleting remaining destinations.
        }
    }
}
