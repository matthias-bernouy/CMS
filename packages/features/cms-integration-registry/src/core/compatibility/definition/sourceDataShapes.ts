import { isDeepStrictEqual } from "node:util";
import type { DeclarativeArtifactTemplate } from "@bernouy/cms-integrations";
import type { CompatibilityChangeSink } from "../changes";

type Source = Extract<DeclarativeArtifactTemplate, { type: "source" }>["source"];
type Endpoint = Source["endpoints"][number];
type Shape = NonNullable<Endpoint["body"]>;
type Response = NonNullable<Endpoint["output"]>[number];

export function compareSourceEndpointDataContracts(
    baseline: Endpoint,
    candidate: Endpoint,
    path: string,
    add: CompatibilityChangeSink,
): void {
    compareRequestShape(baseline.body, candidate.body, `${path}.body`, add);
    compareResponses(baseline.output, candidate.output, `${path}.output`, add);
}

function compareRequestShape(
    baseline: Shape | undefined,
    candidate: Shape | undefined,
    path: string,
    add: CompatibilityChangeSink,
): void {
    if (!baseline && !candidate) {
        return;
    }
    if (!baseline) {
        add("additive", "artifact", "endpoint-request-body-added", path, "Request body contract was declared");
        return;
    }
    if (!candidate) {
        add("breaking", "artifact", "endpoint-request-body-removed", path, "Request body contract was removed");
        return;
    }
    compareShapeNode(baseline, candidate, path, "request", add);
}

function compareResponses(
    baseline: readonly Response[] | undefined,
    candidate: readonly Response[] | undefined,
    path: string,
    add: CompatibilityChangeSink,
): void {
    const previous = new Map((baseline ?? []).map((response) => [response.status, response]));
    const next = new Map((candidate ?? []).map((response) => [response.status, response]));
    for (const [status, response] of previous) {
        const candidateResponse = next.get(status);
        if (!candidateResponse) {
            add(
                "breaking",
                "artifact",
                "endpoint-response-removed",
                `${path}.${status}`,
                "Response status was removed",
            );
            continue;
        }
        compareResponseShape(response.body, candidateResponse.body, `${path}.${status}.body`, add);
        compareResponseShape(response.triggerBody, candidateResponse.triggerBody, `${path}.${status}.triggerBody`, add);
    }
    for (const [status] of next) {
        if (!previous.has(status)) {
            add("additive", "artifact", "endpoint-response-added", `${path}.${status}`, "Response status was added");
        }
    }
}

function compareResponseShape(
    baseline: Shape | undefined,
    candidate: Shape | undefined,
    path: string,
    add: CompatibilityChangeSink,
): void {
    if (!baseline && !candidate) {
        return;
    }
    if (!baseline) {
        add("additive", "artifact", "endpoint-response-body-added", path, "Response body was added");
        return;
    }
    if (!candidate) {
        add("breaking", "artifact", "endpoint-response-body-removed", path, "Response body was removed");
        return;
    }
    compareShapeNode(baseline, candidate, path, "response", add);
}

function compareShapeNode(
    baseline: Shape,
    candidate: Shape,
    path: string,
    direction: "request" | "response",
    add: CompatibilityChangeSink,
): void {
    if (baseline.type !== candidate.type) {
        add("breaking", "artifact", `endpoint-${direction}-type-changed`, path, "Data shape type changed");
        return;
    }
    compareNullability(baseline, candidate, path, direction, add);
    if (!isDeepStrictEqual(baseline.semantic, candidate.semantic)) {
        add("unknown", "artifact", `endpoint-${direction}-semantic-changed`, path, "Data shape semantic changed");
    }
    if (baseline.type === "object") {
        compareProperties(baseline, candidate, path, direction, add);
    }
    if (baseline.type === "array") {
        compareItems(baseline, candidate, path, direction, add);
    }
}

function compareNullability(
    baseline: Shape,
    candidate: Shape,
    path: string,
    direction: "request" | "response",
    add: CompatibilityChangeSink,
): void {
    if (Boolean(baseline.nullable) === Boolean(candidate.nullable)) {
        return;
    }
    const additive = direction === "request" ? candidate.nullable === true : baseline.nullable === true;
    add(
        additive ? "additive" : "breaking",
        "artifact",
        `endpoint-${direction}-nullability-changed`,
        path,
        `${direction === "request" ? "Request" : "Response"} nullability changed`,
    );
}

function compareProperties(
    baseline: Shape,
    candidate: Shape,
    path: string,
    direction: "request" | "response",
    add: CompatibilityChangeSink,
): void {
    const previous = baseline.properties ?? {};
    const next = candidate.properties ?? {};
    const previousRequired = new Set(baseline.required ?? []);
    const nextRequired = new Set(candidate.required ?? []);
    for (const [name, shape] of Object.entries(previous)) {
        const candidateShape = next[name];
        const propertyPath = `${path}.properties.${name}`;
        if (!candidateShape) {
            add("breaking", "artifact", `endpoint-${direction}-property-removed`, propertyPath, "Property was removed");
            continue;
        }
        compareRequired(name, previousRequired, nextRequired, propertyPath, direction, add);
        compareShapeNode(shape, candidateShape, propertyPath, direction, add);
    }
    for (const [name] of Object.entries(next)) {
        if (Object.hasOwn(previous, name)) {
            continue;
        }
        const breaking = direction === "request" && nextRequired.has(name);
        add(
            breaking ? "breaking" : "additive",
            "artifact",
            `endpoint-${direction}-property-added`,
            `${path}.properties.${name}`,
            breaking ? "Required request property was added" : "Property was added",
        );
    }
}

function compareRequired(
    name: string,
    previous: ReadonlySet<string>,
    next: ReadonlySet<string>,
    path: string,
    direction: "request" | "response",
    add: CompatibilityChangeSink,
): void {
    if (previous.has(name) === next.has(name)) {
        return;
    }
    const breaking = direction === "request" ? next.has(name) : previous.has(name);
    add(
        breaking ? "breaking" : "additive",
        "artifact",
        `endpoint-${direction}-property-required-changed`,
        path,
        `${direction === "request" ? "Request" : "Response"} property requirement changed`,
    );
}

function compareItems(
    baseline: Shape,
    candidate: Shape,
    path: string,
    direction: "request" | "response",
    add: CompatibilityChangeSink,
): void {
    if (baseline.items && candidate.items) {
        compareShapeNode(baseline.items, candidate.items, `${path}.items`, direction, add);
    } else if (baseline.items && !candidate.items) {
        add(
            direction === "request" ? "additive" : "breaking",
            "artifact",
            `endpoint-${direction}-items-removed`,
            `${path}.items`,
            "Array item contract was removed",
        );
    } else if (!baseline.items && candidate.items) {
        add(
            direction === "request" ? "breaking" : "additive",
            "artifact",
            `endpoint-${direction}-items-added`,
            `${path}.items`,
            "Array item contract was declared",
        );
    }
}
