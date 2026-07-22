import { makeEndpointUrn, makeSourceUrn } from "@bernouy/cms-sources";

export function echoFunction() {
    return {
        id: "echoPayload",
        method: "POST" as const,
        access: { mode: "admin" as const },
        meta: {
            name: "Echo payload",
            description: "Returns the submitted body.",
        },
        input: {
            body: {
                type: "object" as const,
                properties: { name: { type: "string" as const } },
                required: ["name"],
            },
        },
        output: [{ status: "200", body: { type: "object" as const } }],
        steps: [],
        return: {
            status: 200,
            body: {
                body: "$input.body",
                userId: "$ctx.user.id",
            },
        },
    };
}

export function sendEmailFunction() {
    return {
        id: "sendEmail",
        method: "POST" as const,
        steps: [
            {
                id: "message",
                call: {
                    source: "emailer",
                    endpoint: "sendTemplateEmail",
                    body: {
                        key: "newsletter",
                        toEmails: ["ada@example.test"],
                        data: {},
                    },
                },
            },
        ],
        return: { status: 200, body: "$steps.message" },
    };
}

export function emailerSource() {
    return {
        urn: makeSourceUrn("emailer"),
        meta: { name: "Emailer" },
        endpoints: [
            {
                urn: makeEndpointUrn("emailer", "sendTemplateEmail"),
                method: "POST" as const,
                targetUrl: "https://emailer.test/template/send",
                input: {
                    params: [],
                    body: {
                        type: "object" as const,
                        properties: {
                            key: { type: "string" as const },
                            toEmails: { type: "array" as const, items: { type: "string" as const } },
                            data: { type: "object" as const },
                        },
                        required: ["key", "toEmails"],
                    },
                },
                output: [{ status: "200", body: { type: "object" as const } }],
            },
        ],
    };
}
