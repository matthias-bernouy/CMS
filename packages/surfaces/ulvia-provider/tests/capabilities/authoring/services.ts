import type { AuthoringService, AuthoringServices } from "@bernouy/cms-repository/features/authoring";
const unused = async (): Promise<never> => {
    throw new Error("Unexpected authoring test service call");
};
function method<Value extends (...args: never[]) => unknown>(value: Value | undefined, owner: object): Value {
    return (value ? value.bind(owner) : unused) as Value;
}
/** Complete test ports preserve class receivers; every unused action refuses loudly. */
export function authoringServices(service: Partial<AuthoringService> = {}): AuthoringServices {
    return {
        authoring: {
            connectionStatus: method(service.connectionStatus, service),
            configureConnection: method(service.configureConnection, service),
            disconnectConnection: method(service.disconnectConnection, service),
            listNamespaces: method(service.listNamespaces, service),
            claim: method(service.claim, service),
            prepare: method(service.prepare, service),
            publish: method(service.publish, service),
            sources: method(service.sources, service),
            discard: method(service.discard, service),
            prepareArtifact: method(service.prepareArtifact, service),
            publishArtifact: method(service.publishArtifact, service),
            artifactSources: method(service.artifactSources, service),
        },
    };
}
