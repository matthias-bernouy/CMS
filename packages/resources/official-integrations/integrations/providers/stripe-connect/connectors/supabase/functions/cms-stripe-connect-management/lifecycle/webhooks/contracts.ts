export type IntegrationAnswerValue =
    | string
    | number
    | boolean
    | null
    | IntegrationAnswerValue[]
    | { [key: string]: IntegrationAnswerValue };
export type IntegrationProvisionResourceResult = { type: string; id: string; action: "created" | "updated" };
export type IntegrationProvisionDeployment = {
    integrationKind: string;
    version?: string;
    configuration: Record<string, IntegrationAnswerValue>;
    outputs: { name: string }[];
};
export type IntegrationProvisionContext = { existingOutputs: Record<string, string> };
export interface IntegrationProvisioner {
    readonly provider: string;
}
export class IntegrationRuntimeError extends Error {
    constructor(
        message: string,
        readonly status = 502,
    ) {
        super(message);
    }
}
export class IntegrationInputError extends Error {
    constructor(path: string, message: string) {
        super(`${path}: ${message}`);
    }
}
