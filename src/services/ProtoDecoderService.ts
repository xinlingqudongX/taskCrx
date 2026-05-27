import protobuf from "protobufjs";

export class ProtoDecoderService {
    private roots: Map<string, protobuf.Root> = new Map();

    loadProtoSource(name: string, protoSource: string): void {
        const root = protobuf.parse(protoSource).root;
        this.roots.set(name, root);
    }

    async loadProtoFile(name: string, url: string): Promise<void> {
        const root = await protobuf.load(url);
        this.roots.set(name, root);
    }

    decode(data: Uint8Array, rootName?: string): { typeName: string; message: any } | null {
        const roots = rootName
            ? [this.roots.get(rootName)].filter(Boolean) as protobuf.Root[]
            : Array.from(this.roots.values());

        for (const root of roots) {
            const types = this.getAllTypes(root);
            for (const typeName of types) {
                try {
                    const type = root.lookupType(typeName);
                    const msg = type.decode(data);
                    const obj = type.toObject(msg, {
                        longs: String,
                        enums: Number,
                        bytes: String,
                        defaults: true,
                    });
                    return { typeName, message: obj };
                } catch {
                    // try next
                }
            }
        }
        return null;
    }

    decodeAs(data: Uint8Array, rootName: string, typeName: string): any | null {
        const root = this.roots.get(rootName);
        if (!root) return null;
        try {
            const type = root.lookupType(typeName);
            const msg = type.decode(data);
            return type.toObject(msg, {
                longs: String,
                enums: Number,
                bytes: String,
                defaults: true,
            });
        } catch {
            return null;
        }
    }

    encode(obj: any, rootName: string, typeName: string): Uint8Array | null {
        const root = this.roots.get(rootName);
        if (!root) return null;
        try {
            const type = root.lookupType(typeName);
            const errMsg = type.verify(obj);
            if (errMsg) throw new Error(errMsg);
            const msg = type.create(obj);
            return type.encode(msg).finish();
        } catch {
            return null;
        }
    }

    private getAllTypes(root: protobuf.Root): string[] {
        const types: string[] = [];
        const walk = (ns: protobuf.Namespace, prefix: string) => {
            for (const [name, nested] of Object.entries(ns.nested || {})) {
                const fullName = prefix ? `${prefix}.${name}` : name;
                if (nested instanceof protobuf.Type) {
                    types.push(fullName);
                }
                if (nested instanceof protobuf.Namespace) {
                    walk(nested, fullName);
                }
            }
        };
        walk(root, "");
        return types;
    }

    unload(name: string): void {
        this.roots.delete(name);
    }

    getLoadedNames(): string[] {
        return Array.from(this.roots.keys());
    }
}

export const protoDecoder = new ProtoDecoderService();
