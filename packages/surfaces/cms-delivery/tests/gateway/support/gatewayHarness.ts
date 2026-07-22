import DeliveryCms from "cms-delivery/DeliveryCms";
import { InMemorySourceRepository, seedSources, type Source } from "@bernouy/cms-sources";
import { InMemoryRolesRepository, PUBLIC_ROLE, USER_ROLE, type RolesRepository } from "@bernouy/cms-permissions";
import { CaptureRunner } from "./CaptureRunner";

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
                    {
                        name: "user_role",
                        in: "query",
                        required: true,
                        source: { from: "computed", ref: "userRole" },
                        schema: { type: "string" },
                    },
                ],
            },
            output: [{ status: "200" }],
        },
    ],
};

export async function publicGatewayRoles(permission = "urn:secured:get"): Promise<RolesRepository> {
    return gatewayRoles(PUBLIC_ROLE, permission);
}

export async function gatewayRoles(role: string, permission: string): Promise<RolesRepository> {
    const roles = new InMemoryRolesRepository();
    await roles.upsert({
        id: role,
        label: role,
        builtin: role === PUBLIC_ROLE || role === USER_ROLE,
        grants: [{ permission }],
    });
    return roles;
}

export async function mountDeliveryGateway(
    opts: {
        resolveSecret?: (ref: string) => Promise<string | undefined>;
        roles?: RolesRepository;
        providers?: Source[];
        auth?: unknown;
    } = {},
) {
    const gateway = new InMemorySourceRepository();
    await seedSources(gateway, opts.providers ?? [SECURED]);
    const runner = new CaptureRunner();
    new DeliveryCms({
        runner,
        repository: {} as any,
        sources: gateway,
        sourceResolveSecret: opts.resolveSecret,
        roles: opts.roles,
        auth: opts.auth as any,
    });
    return runner.defaultHandler("GET", "/.cms/sources");
}
