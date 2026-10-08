import { encodeHttpParameter } from "@bernouy/cms-repository/contracts/bindings";
import type { CompiledHttpParameter } from "@bernouy/cms-repository/contracts/bindings";
import { canonicalizeIJson } from "@bernouy/cms-repository/contracts/protocol";
import type { UlviaScalarSchema } from "@bernouy/cms-repository/contracts/schema";
import type { GatewayTransportRequest } from "cms-gateway/invocation/interfaces/Invocation";

export interface PreparedHttpInvocation {
    readonly origin: string;
    readonly pathAndQuery: string;
    readonly method: string;
    /** Application headers only; credentials and identity are added by the trusted network adapter. */
    readonly headers: Readonly<Record<string, string>>;
    readonly body?: string | ReadableStream<Uint8Array>;
    readonly contentLength?: number;
}

/** Compiles an admitted binding and validated input into one HTTP request. */
export function buildHttpInvocation(request: GatewayTransportRequest): PreparedHttpInvocation {
    const target = new URL(request.endpoint);
    if (
        target.username ||
        target.password ||
        target.search ||
        target.hash ||
        target.pathname !== "/" ||
        request.endpoint !== target.origin ||
        (target.protocol !== "https:" &&
            !(
                target.protocol === "http:" &&
                (target.hostname === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(target.hostname))
            ))
    ) {
        throw new TypeError("provider endpoint must be an approved origin");
    }
    const { binding, capability, input } = request;
    let path = binding.path;
    for (const parameter of binding.pathParameters) {
        const encoded = encode(parameter);
        if (encoded === undefined) {
            throw new TypeError(`missing required path property ${parameter.property}`);
        }
        path = path.replace(`{${parameter.wireName}}`, encoded);
    }
    const query = binding.query.flatMap((parameter) => {
        const encoded = encode(parameter);
        return encoded === undefined ? [] : [`${parameter.wireName}=${encoded}`];
    });
    const headers = Object.fromEntries(
        binding.headers.flatMap((parameter) => {
            const encoded = encode(parameter);
            return encoded === undefined ? [] : [[parameter.wireName, encoded]];
        }),
    );
    let body: string | ReadableStream<Uint8Array> | undefined;
    let contentLength: number | undefined;
    if (binding.body?.kind === "json") {
        const values: Record<string, unknown> = {};
        for (const property of binding.body.properties) {
            if (Object.hasOwn(input, property)) {
                values[property] = input[property];
            }
        }
        body = canonicalizeIJson(values);
        headers["content-type"] = "application/json";
    } else if (binding.body) {
        if (!request.binaryBody) {
            throw new TypeError("binary request body is missing");
        }
        body = request.binaryBody.stream;
        contentLength = request.binaryBody.contentLength;
        if (request.binaryBody.contentType) {
            headers["content-type"] = request.binaryBody.contentType;
        }
    }
    return Object.freeze({
        origin: target.origin,
        pathAndQuery: `${path}${query.length ? `?${query.join("&")}` : ""}`,
        method: binding.method,
        headers: Object.freeze(headers),
        ...(body === undefined ? {} : { body }),
        ...(contentLength === undefined ? {} : { contentLength }),
    });

    function encode(parameter: CompiledHttpParameter): string | undefined {
        const schema = capability.input.properties[parameter.property] as UlviaScalarSchema;
        return encodeHttpParameter(schema, input[parameter.property]);
    }
}
