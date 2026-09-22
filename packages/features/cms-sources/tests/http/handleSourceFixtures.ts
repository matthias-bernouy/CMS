import { mock } from "bun:test";
import { InMemorySourceRepository } from "cms-sources/default-implementation/InMemorySourceRepository";
import type { Source } from "cms-sources/interfaces/Source";

export const SOURCE_PREFIX = "/base/.cms/sources/";

const source: Source = {
    urn: "urn:shop",
    endpoints: [
        {
            urn: "urn:shop:getCart",
            method: "GET",
            targetUrl: "https://api.shop.com/cart",
            output: [{ status: "200", body: { type: "object" } }],
        },
    ],
};

export async function seededSourceRepository() {
    const repository = new InMemorySourceRepository();
    await repository.createSource(source);
    return repository;
}

export const okFetch = () =>
    mock(async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) =>
        Response.json({ ok: true }),
    );
