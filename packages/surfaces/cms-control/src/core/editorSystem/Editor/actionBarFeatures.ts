export type ActionBarFeature =
    | 'delete'
    | 'duplicate'
    | 'addBefore'
    | 'addAfter'
    | 'changeComponent'
    | 'saveAsTemplate';

export type ActionBarFeatures = Map<ActionBarFeature, boolean>;

export function defaultActionBarFeatures(): ActionBarFeatures {
    return new Map<ActionBarFeature, boolean>([
        ['delete', true],
        ['duplicate', true],
        ['addBefore', false],
        ['addAfter', false],
        ['changeComponent', false],
        ['saveAsTemplate', false],
    ]);
}

export function syncActionBarFeaturesFromAttrs(target: HTMLElement, features: ActionBarFeatures): void {
    features.set('delete', target.getAttribute(p9r.attr.ACTION.DISABLE_DELETE) !== 'true');
    features.set('duplicate', target.getAttribute(p9r.attr.ACTION.DISABLE_DUPLICATE) !== 'true');
    features.set('addBefore', target.getAttribute(p9r.attr.ACTION.DISABLE_ADD_BEFORE) !== 'true');
    features.set('addAfter', target.getAttribute(p9r.attr.ACTION.DISABLE_ADD_AFTER) !== 'true');
    features.set('changeComponent', target.getAttribute(p9r.attr.ACTION.DISABLE_CHANGE_COMPONENT) !== 'true');
    features.set('saveAsTemplate', target.getAttribute(p9r.attr.ACTION.DISABLE_SAVE_AS_TEMPLATE) !== 'true');
}
