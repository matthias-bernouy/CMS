import type { GatewayRoute } from "cms-gateway/invocation/interfaces/Invocation";
import type { AdmittedContractRelease } from "@bernouy/ulvia-contracts";
import { definitionHash } from "./values";
import type { GatewayDefinition, GatewayDefinitionValue, GatewayRoutePacket } from "./types";

/** Hash the complete admitted representation, including binding plans and property order. */
async function gatewayDefinition(value: GatewayDefinitionValue): Promise<GatewayDefinition> {
    const kind = "release" in value ? "contract" : "manifest";
    const json = JSON.stringify(value);
    return { key: `${kind}:${await definitionHash(json)}`, json };
}

/** Only immutable admissions are referenced; mutable route fields are always present. */
export async function packGatewayRoute(route: GatewayRoute, known: readonly string[]): Promise<GatewayRoutePacket> {
    const encoded = new Map<GatewayDefinitionValue, GatewayDefinition>();
    for (const value of [route.release.admission, route.requestedRelease.admission, route.manifest.admission]) {
        if (!encoded.has(value)) {
            encoded.set(value, await gatewayDefinition(value));
        }
    }
    const packed = {
        ...route,
        release: { ...route.release, admission: encoded.get(route.release.admission)!.key },
        requestedRelease: { ...route.requestedRelease, admission: encoded.get(route.requestedRelease.admission)!.key },
        manifest: { ...route.manifest, admission: encoded.get(route.manifest.admission)!.key },
    };
    const snapshot = JSON.stringify({ format: "ulvia.gateway-route.v1", route: packed });
    const definitions = [
        ...new Map(
            [...encoded.values()].filter(({ key }) => !known.includes(key)).map((entry) => [entry.key, entry]),
        ).values(),
    ];
    const packet = { snapshot, definitions };
    if (
        snapshot.length > 1024 ** 2 ||
        definitions.some(({ json }) => json.length > 1024 ** 2) ||
        new TextEncoder().encode(JSON.stringify(packet)).byteLength > 2 * 1024 ** 2
    ) {
        throw new TypeError("Gateway route packet exceeds its bound");
    }
    return packet;
}

export async function packGatewayContract(contract: AdmittedContractRelease | null, known: readonly string[]) {
    if (!contract) {
        return { found: false, key: "", definitions: [] };
    }
    const definition = await gatewayDefinition(contract);
    if (definition.json.length > 1024 ** 2) {
        throw new TypeError("Gateway contract definition exceeds its bound");
    }
    return { found: true, key: definition.key, definitions: known.includes(definition.key) ? [] : [definition] };
}
