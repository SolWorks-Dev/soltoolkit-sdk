import { Transaction, Connection, PublicKey, ConnectionConfig, Commitment, Signer, SendOptions } from '@solana/web3.js';
import { ILogger } from '../interfaces/ILogger';
import { IWallet } from '../interfaces/IWallet';
import { ConnectionManager } from './ConnectionManager';
import { Logger } from './Logger';
import bs58 from 'bs58';
import fetch from 'node-fetch';

/**
 * TransactionWrapper is a utility class that simplifies the process of creating, signing, sending, and confirming transactions.
 */
export class TransactionWrapper {
    private _transactions: Transaction[];
    private _connection: Connection;
    private _logger: ILogger = new Logger('@soltoolkit/TransactionWrapper');
    private _feePayer?: PublicKey;

    private constructor(connection: Connection, transaction?: Transaction | Transaction[], feePayer?: PublicKey) {
        this._transactions = transaction ? (Array.isArray(transaction) ? transaction : [transaction]) : [];
        this._connection = connection;
        this._feePayer = feePayer;
    }

    public static create({
        transaction,
        transactions,
        rpcEndpoint,
        connection,
        connectionManager,
        config,
        changeConn = false
    }: {
        transaction?: Transaction;
        transactions?: Transaction[];
        rpcEndpoint?: string;
        connection?: Connection;
        connectionManager?: ConnectionManager;
        config?: ConnectionConfig;
        changeConn?: boolean;
    }): TransactionWrapper {
        var conn: Connection;

        if (connection) {
            conn = connection;
        } else if (rpcEndpoint) {
            conn = new Connection(rpcEndpoint, config);
        } else if (connectionManager) {
            conn = connectionManager.connSync({ changeConn });
        } else {
            throw new Error('No connection or rpc endpoint provided');
        }

        return new TransactionWrapper(conn, transaction || transactions);
    }

    public async sendAndConfirm({
        serialisedTx,
        maximumRetries = 5,
        commitment = 'max',
        skipPreflight = false
    }: {
        serialisedTx: Uint8Array | Buffer | number[];
        maximumRetries?: number;
        commitment?: Commitment;
        skipPreflight?: boolean;
    }): Promise<string> {
        var signature: string | undefined;
        var tries = 0;
        var isTransactionConfirmed = false;
        while (
            tries < maximumRetries && // not exceeded max retries
            !isTransactionConfirmed // no confirmation of any signature
        ) {
            try {
                signature = await this.sendTx({ serialisedTx, skipPreflight });
                const result = await this.confirmTx({ signature, commitment });
                if (result.value.err !== null) {
                    throw new Error(`RPC failure: ${JSON.stringify(result.value.err)}`);
                }
                this._logger.debug(result);
                isTransactionConfirmed = true;
            } catch (e: any) {
                if (e.message.includes('RPC failure')) {
                    throw e;
                } else {
                    this._logger.warn('Transaction failed, retrying...', e);
                    tries++;
                }
            }
        }

        if (signature === undefined || !isTransactionConfirmed) {
            throw this._logger.makeError(`Transaction failed after ${tries} tries`);
        }

        return signature;
    }

    public async addBlockhashAndFeePayer(feePayer?: PublicKey) {
        const latestBlockhash = await this._connection.getLatestBlockhash();
        for (const transaction of this._transactions) {
            transaction.recentBlockhash = latestBlockhash.blockhash;
            transaction.feePayer = feePayer || this._feePayer;

            if (transaction.feePayer === undefined) {
                throw new Error('Fee payer must be defined');
            }

            this._logger.debug('blockhash:', transaction.recentBlockhash);
            this._logger.debug('fee payer:', transaction.feePayer.toBase58());
        }
        return this;
    }

    public async sign({
        wallet,
        signers,
        txs
    }: {
        wallet?: IWallet;
        signers?: Signer[];
        txs?: Transaction[];
    }): Promise<Transaction[]> {
        if (!wallet && !signers) {
            throw new Error('No wallet or signers provided');
        }

        if (txs === undefined) {
            txs = this._transactions;
        }

        if (wallet) {
            var signedTx = await wallet.signAllTransactions(txs);
            return signedTx!;
        } else if (signers) {
            for (const signer of signers) {
                for (const transaction of txs) {
                    transaction.sign(signer);
                }
            }
            return txs;
        } else {
            throw new Error('Wallet or Signer must be provided');
        }
    }

    public async sendTx({ 
        serialisedTx, 
        skipPreflight = false
    }: { 
        serialisedTx: Uint8Array | Buffer | number[];
        skipPreflight?: boolean;
    }) {
        var sig = await this._connection.sendRawTransaction(serialisedTx, {
            skipPreflight
        });
        return sig;
    }

    public async sendTxUsingJito({
        serializedTx,
        region = 'mainnet'
    }: {
        serializedTx: Uint8Array | Buffer | number[];
        region: JitoRegion;
    }) {
        return await sendTxUsingJito({ serializedTx, region });
    }

    public async confirmTx({ signature, commitment = 'max' }: { signature: string; commitment?: Commitment }) {
        const latestBlockHash = await this._connection.getLatestBlockhash(commitment);

        return await this._connection.confirmTransaction(
            {
                signature: signature,
                blockhash: latestBlockHash.blockhash,
                lastValidBlockHeight: latestBlockHash.lastValidBlockHeight
            },
            commitment
        );
    }

    public static async confirmTx({
        connection,
        connectionManager,
        signature,
        commitment = 'max',
        changeConn = false,
        airdrop
    }: {
        connection?: Connection;
        connectionManager?: ConnectionManager;
        signature: string;
        commitment?: Commitment;
        changeConn?: boolean;
        airdrop?: boolean;
    }) {
        // if connection is not provided, use connection manager
        if (connection === undefined && connectionManager !== undefined) {
            connection = connectionManager.connSync({ changeConn, airdrop });
        } else if (connection === undefined && connectionManager === undefined) {
            throw new Error('No connection or connection manager provided');
        }

        if (connection === undefined) {
            throw new Error('Connection is undefined');
        }

        const latestBlockHash = await connection.getLatestBlockhash(commitment);

        return await connection.confirmTransaction(
            {
                signature: signature,
                blockhash: latestBlockHash.blockhash,
                lastValidBlockHeight: latestBlockHash.lastValidBlockHeight
            },
            commitment
        );
    }
}

export type JitoRegion = 'mainnet' | 'amsterdam' | 'frankfurt' | 'ny' | 'tokyo';
export const JitoEndpoints = {
    mainnet: 'https://mainnet.block-engine.jito.wtf/api/v1/',
    amsterdam: 'https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/',
    frankfurt: 'https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/',
    ny: 'https://ny.mainnet.block-engine.jito.wtf/api/v1/',
    tokyo: 'https://tokyo.mainnet.block-engine.jito.wtf/api/v1/'
};
interface BundleStatusResult {
    bundle_id: string;
    transactions: string[];
    slot: number;
    confirmation_status: string;
    err?: any;
}
export function getJitoEndpoint(region: JitoRegion) {
    return JitoEndpoints[region];
}
/**
 * Send a transaction using Jito. This only supports sending a single transaction on mainnet only.
 * See https://jito-labs.gitbook.io/mev/searcher-resources/json-rpc-api-reference/transactions-endpoint/sendtransaction.
 * @param args.serialisedTx - A single transaction to be sent, in serialised form
 * @param args.region - The region of the Jito endpoint to use
 * @returns The signature of the transaction
 */
export async function sendTxUsingJito({
    serializedTx,
    region = 'mainnet'
}: {
    serializedTx: Uint8Array | Buffer | number[];
    region?: JitoRegion;
}): Promise<string> {
    let rpcEndpoint = getJitoEndpoint(region);
    let encodedTx = bs58.encode(serializedTx);
    let payload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'sendTransaction',
        params: [encodedTx]
    };
    let res = await fetch(`${rpcEndpoint}/transactions?bundleOnly=true`, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' }
    });
    let json = await res.json();
    if (json.error) {
        throw new Error(json.error.message);
    }
    return json.result;
}
/**
 * Send a bundle of transactions using Jito.
 * @param param0.signedTxs - An array of signed transactions
 * @param param0.region - The region of the Jito endpoint to use. Defaults to mainnet.
 * @returns A bundle ID, used to identify the bundle. This is the SHA-256 hash of the bundle's transaction signatures.
 */
export async function sendTransactionsAsBundleUsingJito({
    signedTxs,
    region = 'mainnet'
}: {
    signedTxs: Transaction[];
    region?: JitoRegion;
}): Promise<string> {
    // Get the endpoint for the region
    let rpcEndpoint = getJitoEndpoint(region);

    // Encode the transactions
    let encodedTxs = signedTxs.map((tx) =>
        bs58.encode(
            tx.serialize({
                // Skip signature verification
                verifySignatures: true
            })
        )
    );

    // Send bundle
    let payload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'sendBundle',
        params: [encodedTxs]
    };
    let res = await fetch(`${rpcEndpoint}/bundles`, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' }
    });

    // Parse response and return bundle ID
    let json = await res.json();
    if (json.error) {
        throw new Error(json.error.message);
    }
    return json.result;
}
/**
 * Get the status of a bundle using Jito.
 * @param param0.bundleId - The bundle ID to get the status of.
 * @returns The status of the bundle, or null if the bundle does not exist.
 */
export async function getJitoBundleStatus({
    bundleId,
    region = 'mainnet'
}: {
    bundleId: string;
    region?: JitoRegion;
}): Promise<BundleStatusResult[] | null> {
    // Get the endpoint for the region
    let rpcEndpoint = getJitoEndpoint(region);

    // Send bundle status request
    let payload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'getBundleStatuses',
        params: [[bundleId]]
    };
    let res = await fetch(`${rpcEndpoint}/bundles`, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' }
    });

    // Parse response
    let json = await res.json();
    if (json === null) {
        return null;
    }
    if (json.error) {
        throw new Error(json.error.message);
    }
    return json.result.value as BundleStatusResult[];
}
