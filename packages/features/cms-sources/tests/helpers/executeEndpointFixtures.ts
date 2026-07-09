import { mock } from "bun:test";
import type { SourceEndpoint } from "cms-sources/interfaces/Source";

export const ep = (over: Partial<SourceEndpoint> = {}): SourceEndpoint => ({
    urn: "urn:x:e",
    method: "GET",
    targetUrl: "https://api.example.com/v1/items",
    ...over,
});

export const okFetch = () =>
    mock(async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => new Response("ok"));
