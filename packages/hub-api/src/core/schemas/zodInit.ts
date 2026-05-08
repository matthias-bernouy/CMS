import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

// Extends `z` with `.openapi(...)`. Imported for side-effects from every
// schema file, but the registration is idempotent so multiple imports are safe.
extendZodWithOpenApi(z);

export { z };
