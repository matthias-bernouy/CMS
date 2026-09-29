import DeliveryCms from "cms-delivery/DeliveryCms";
import { InMemorySourceRepository, seedSources, type Source } from "@bernouy/cms-sources";
import { CaptureRunner } from "./CaptureRunner";
import { handleDeliverySourceRequest } from "cms-delivery/core/sources/executeSourceRequest";

const SECURED: Source = {
    urn: "urn:secured",
    endpoints: [
        {
            urn: "urn:secured:get",
            method: "GET",
            access: { mode: "public" },
            targetUrl: "https://api.example.com/data",
            responseKind: "file",
            headers: [{ name: "authorization", source: { from: "secret", ref: "${API_KEY}", prefix: "Bearer " } }],
            output: [{ status: "200" }],
        },
    ],
};

export const COMPUTED: Source = {
    urn: "urn:computed",
    endpoints: [
        {
            urn: "urn:computed:me",
            method: "GET",
            access: { mode: "auth" },
            targetUrl: "https://api.example.com/me",
            responseKind: "file",
            input: {
                params: [
                    {
                        name: "user_id",
                        in: "query",
                        required: true,
                        source: { from: "computed", ref: "userID" },
                        schema: { type: "string" },
                    },
                ],
            },
            output: [{ status: "200" }],
        },
    ],
};

export async function mountDeliveryGateway(
    opts: { resolveSecret?: (ref: string) => Promise<string | undefined>; providers?: Source[]; auth?: unknown } = {},
) {
    const gateway = new InMemorySourceRepository();
    await seedSources(gateway, opts.providers ?? [SECURED]);
    const runner = new CaptureRunner();
    const delivery = new DeliveryCms({
        runner,
        repository: {} as any,
        sources: gateway,
        sourceResolveSecret: opts.resolveSecret,
        auth: opts.auth as any,
    });
    return (request: Request) => handleDeliverySourceRequest(delivery, request);
}
