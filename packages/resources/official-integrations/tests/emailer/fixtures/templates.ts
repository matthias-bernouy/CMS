import type { JsonRecord } from "../harness/types";

export function welcomeTemplate(): JsonRecord {
    return {
        key: "auth.welcome",
        name: "Welcome email",
        status: "active",
        subject: "Welcome {{ user.name }}",
        htmlBody: "<p>Hello {{ user.name }}</p>",
        textBody: "Hello {{ user.name }}",
        requiredTokens: [{ name: "user.name", description: "Recipient display name", sample: "Ada" }],
        sampleDataJson: JSON.stringify({ user: { name: "Ada" } }),
    };
}
