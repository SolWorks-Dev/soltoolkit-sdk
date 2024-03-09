import { PublicKey } from "@solana/web3.js";
import {
    SNSDomainResolver,
    Logger
} from "@solworks/soltoolkit-sdk";

const logger = new Logger("example");
const addressString = '5F6gcdzpw7wUjNEugdsD4aLJdEQ4Wt8d6E85vaQXZQSJ';
const addressPublicKey = new PublicKey(addressString);

(async () => {
    // use the SNSDomainResolver to get the first .sol domain associated with an address
    // getDomainFromAddress takes a PublicKey or an address string as an argument
    // getDomainFromAddress returns a Promise<string | null>
    const firstDomainPk = await SNSDomainResolver.getDomainFromAddress(addressPublicKey);
    logger.info(`First domain for address: ${firstDomainPk || "no domain found"}`);
    const firstDomainString = await SNSDomainResolver.getDomainFromAddress(addressString);
    logger.info(`First domain for address: ${firstDomainString || "no domain found"}`);

    // use the SNSDomainResolver to get all .sol domains associated with an address
    // getDomainsFromAddress takes a PublicKey or an address string as an argument
    // getDomainsFromAddress returns a Promise<string[] | null>
    const allDomainsPk = await SNSDomainResolver.getDomainsFromAddress(addressPublicKey);
    logger.info(`All domains for address: ${allDomainsPk || "no domains found"}`);
    const allDomainsString = await SNSDomainResolver.getDomainsFromAddress(addressString);
    logger.info(`All domains for address: ${allDomainsString || "no domains found"}`);
})();