import { InMemoryUsersRepository } from "@bernouy/cms-auth";
import { InMemoryIntegrationInstallationRepository } from "@bernouy/cms-integrations";
import { InMemorySourceRepository, type Source } from "@bernouy/cms-sources";

export async function createHarness(email: string | undefined, contractVersion = 1, hasClaim = true) {
    const users = new InMemoryUsersRepository<string>();
    await users.upsert({ sub: "buyer-1", ...(email ? { email } : {}) }, "user");
    const installations = new InMemoryIntegrationInstallationRepository();
    await installations.create(installation("commerce", "commerce"));
    await installations.create(installation("emailer", "mailer"));
    const sources = new InMemorySourceRepository();
    await sources.createSource(notificationSource());
    await sources.createSource(emailerSource());

    const sent: Array<Record<string, unknown>> = [];
    const installedTemplates: unknown[] = [];
    const completed: Array<Record<string, unknown>> = [];
    const failed: Array<Record<string, unknown>> = [];
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const body = request.method === "GET" ? {} : ((await request.json()) as Record<string, unknown>);
        if (request.url === "https://commerce.test/templates") {
            return Response.json({
                contractVersion: 1,
                items: [{ key: "commerce.order.paid", subject: "Order confirmed" }],
            });
        }
        if (request.url === "https://emailer.test/install") {
            installedTemplates.push(...(Array.isArray(body.templates) ? body.templates : []));
            return Response.json({ accepted: installedTemplates.length });
        }
        if (request.url === "https://commerce.test/claim") {
            return Response.json({
                items: hasClaim
                    ? [
                          {
                              deliveryId: "delivery-1",
                              recipientCmsUserId: "buyer-1",
                              templateKey: "commerce.order.paid",
                              idempotencyKey: "commerce-notification:delivery-1",
                              context: {
                                  contractVersion,
                                  recipient: { userId: "buyer-1" },
                                  order: { number: "ORD-1" },
                              },
                          },
                      ]
                    : [],
            });
        }
        if (request.url === "https://emailer.test/send") {
            sent.push(body);
            return Response.json({ id: "message-1", status: "sent" });
        }
        if (request.url === "https://commerce.test/complete") {
            completed.push(body);
            return Response.json({ status: "delivered" });
        }
        if (request.url === "https://commerce.test/fail") {
            failed.push(body);
            return Response.json({ status: "dead_letter" });
        }
        return Response.json({ error: "unexpected request" }, { status: 500 });
    };
    return {
        sent,
        installedTemplates,
        completed,
        failed,
        options: {
            users,
            installations,
            sources,
            deps: { fetchImpl },
            notificationKind: "commerce",
            emailerKind: "emailer",
        },
    };
}

function installation(id: string, sourceId: string) {
    return {
        id,
        label: id,
        definitionVersion: "1.0.0",
        status: "success" as const,
        answersSnapshot: { id: sourceId },
        secretRefs: {},
        secretInputs: [],
        artifacts: [{ type: "source" as const, id: `urn:${sourceId}`, action: "created" as const }],
        runs: [],
    };
}

function notificationSource(): Source {
    return source("commerce", [
        ["listDefaultNotificationTemplates", "https://commerce.test/templates", "GET"],
        ["claimNotifications", "https://commerce.test/claim"],
        ["completeNotification", "https://commerce.test/complete"],
        ["failNotification", "https://commerce.test/fail"],
    ]);
}

function emailerSource(): Source {
    return source("mailer", [
        ["installTemplates", "https://emailer.test/install"],
        ["sendTemplateEmail", "https://emailer.test/send"],
    ]);
}

function source(id: string, endpoints: Array<[string, string, ("GET" | "POST")?]>): Source {
    return {
        urn: `urn:${id}`,
        endpoints: endpoints.map(([endpoint, targetUrl, method = "POST"]) => ({
            urn: `urn:${id}:${endpoint}`,
            method,
            targetUrl,
            access: { mode: "system" },
            output: [{ status: "200", body: { type: "object" } }],
        })),
    };
}
