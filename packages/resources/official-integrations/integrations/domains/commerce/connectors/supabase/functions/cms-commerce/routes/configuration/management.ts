import { HttpError } from "../../core/errors.ts";
import { json } from "../../core/http.ts";
import { readJsonObject } from "../../core/records.ts";
import { commerceHealth } from "./health.ts";

export async function manageCommerce(request: Request): Promise<Response> {
    const invocation = await readJsonObject(request);
    if (invocation.operation !== "health") {
        throw new HttpError(400, "Unsupported Commerce management operation");
    }
    return json(await commerceHealth());
}
