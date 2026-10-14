export * from "cms-content/blocs/core/markup/bindings/types";
export * from "cms-content/blocs/core/markup/bindings/source";
export * from "cms-content/blocs/core/markup/bindings/repeat";
export * from "cms-content/blocs/core/markup/bindings/conditions";
export * from "cms-content/blocs/core/markup/bindings/queryParams";
export * from "cms-content/blocs/core/markup/bindings/sync";
export * from "cms-content/blocs/core/markup/bindings/sourceStatus";
import { CMS_BINDING_RUNTIME_ATTRIBUTES } from "cms-content/blocs/core/markup/bindings/types";

export function clearBindingRuntimeState(root: Element): void {
    const attribute = CMS_BINDING_RUNTIME_ATTRIBUTES.ready;
    root.removeAttribute(attribute);
    root.querySelectorAll(`[${attribute}]`).forEach((element) => element.removeAttribute(attribute));
}
export {
    isCmsSourceSerialization,
    isCmsFormValueType,
    isCmsFormEmptyBehavior,
    isCmsSourceSuccessReload,
} from "cms-content/blocs/core/validation/nativeBindings/formValues";
