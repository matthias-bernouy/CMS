import type {
    IntegrationBrowserHost,
    IntegrationDefinition,
} from "cms-control/components/admin/Resources/Integrations/model";

export const definition: IntegrationDefinition = {
    kind: "stripe-connect",
    label: "Stripe Connect",
    inputs: [
        { name: "id", label: "Identifier", type: "text", required: true },
        { name: "stripePublishableKey", label: "Publishable key", type: "text", required: true },
        { name: "stripeSecretKey", label: "Secret key", type: "password", required: true },
    ],
};

const installation = {
    id: "stripe-connect",
    label: "Stripe Connect",
    status: "success" as const,
    runCount: 1,
    artifactCount: 3,
    missingArtifactCount: 0,
    updatedAt: "2026-07-26T12:00:00.000Z",
};

export function createAdmin(catalogueDefinition: IntegrationDefinition = definition): IntegrationBrowserHost {
    const admin = document.createElement("cms-integrations-admin") as IntegrationBrowserHost;
    document.body.append(admin);
    admin.definitions = [catalogueDefinition];
    admin.installations = [installation];
    admin.selectedIntegrationId = "stripe-connect";
    return admin;
}

export function detail(options: { answers?: Record<string, unknown>; definition?: IntegrationDefinition } = {}) {
    return {
        ...installation,
        answers: options.answers ?? { id: "stripe-connect", stripePublishableKey: "pk_test_public" },
        definition: options.definition ?? definition,
        secretInputs: ["stripeSecretKey"],
    };
}

export function value(admin: IntegrationBrowserHost, name: string): string {
    return admin.query<HTMLInputElement>(`[name="${name}"]`).value;
}

export function setValue(admin: IntegrationBrowserHost, name: string, next: string): void {
    admin.query<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`).value = next;
}

export async function flush(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}
