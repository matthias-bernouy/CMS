export default function contains(o: any, key: string | string[]) {
    if (typeof key === "string") {
        if (!(key in o)) {
            throw new Error(`There is no "${key}" parameter`);
        }
    } else {
        key.forEach((v) => {
            if (!(v in o)) {
                throw new Error(`There is no "${v}" parameter`);
            }
        });
    }
}
