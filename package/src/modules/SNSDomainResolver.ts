import { PublicKey } from "@solana/web3.js";
import fetch from "node-fetch";
interface DomainLookupResponse {
    s:      string;
    result: {
        key:    string;
        domain: string;
    }[];
}

/**
 * A class for resolving .sol domains to public keys.
 */
export default class SNSDomainResolver {
    /**
     * Get the first .sol domain associated with an address.
     * @param address Public key or address string.
     * @returns The domain as a string or null if not found.
     */
    static async getDomainFromAddress(address: string | PublicKey): Promise<string | null> {
        const addressString = typeof address === 'string' ? address : address.toBase58();
        const url = `https://sns-sdk-proxy.bonfida.workers.dev/domains/${addressString}`;
        try {
            const response = await fetch(url);
            const json = await response.json() as DomainLookupResponse;
            return json.result.sort((a, b) => a.key.localeCompare(b.key))[0].domain;
        } catch (e) {
            return null;
        }
    }
    /**
     * Get all .sol domains associated with an address.
     * @param address Public key or address string.
     * @returns The domains as an array of strings or null if not found.
     */
    static async getDomainsFromAddress(address: string | PublicKey): Promise<string[] | null> {
        const addressString = typeof address === 'string' ? address : address.toBase58();
        const url = `https://sns-sdk-proxy.bonfida.workers.dev/domains/${addressString}`;
        try {
            const response = await fetch(url);
            const json = await response.json() as DomainLookupResponse;
            return json.result.sort((a, b) => a.key.localeCompare(b.key)).map(r => r.domain);
        } catch (e) {
            return null;
        }
    }
}