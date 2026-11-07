export class SdkDefinitionError extends TypeError {
    constructor(
        message: string,
        readonly path = "$",
    ) {
        super(`${path}: ${message}`);
        this.name = "SdkDefinitionError";
    }
}
