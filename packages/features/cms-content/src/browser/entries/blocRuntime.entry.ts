import { BlocBehavior, mountBlocBehavior } from "cms-content/browser/component/BlocBehavior";
import { registerBloc } from "cms-content/browser/component/BlocRuntime";

type CmsRuntimeWindow = Window & { cmsRuntime?: Record<string, unknown> };
const runtime = ((window as CmsRuntimeWindow).cmsRuntime ??= {});

Object.assign(runtime, { BlocBehavior, mountBlocBehavior, registerBloc });
