import { SessionProvider } from "../abstracts/session_provider";
export declare class MemorySessionProvider extends SessionProvider {
    get(key: string): Promise<any>;
    isExist(key: string): Promise<boolean>;
    getAll(): Promise<{
        [key: string]: any;
    }>;
    set(key: string, val: any): Promise<void>;
    setMany(values: {
        [key: string]: any;
    }): Promise<void[]>;
    remove(key: string): Promise<void>;
    clear(): Promise<void>;
}
