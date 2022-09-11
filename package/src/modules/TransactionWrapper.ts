import { Transaction, Connection, PublicKey, ConnectionConfig, Commitment, Signer } from '@solana/web3.js';
import { ILogger } from '../interfaces/ILogger';
import { IWallet } from '../interfaces/IWallet';
import { ConnectionManager } from './ConnectionManager';
import { Logger } from './Logger';

export class TransactionWrapper {
    private _transaction: Transaction;
    private _connection: Connection;
    private _signer?: PublicKey;
    private _logger: ILogger = new Logger('@soltoolkit/TransactionWrapper');
    private _feePayer?: PublicKey;

    private constructor(connection: Connection, signer?: PublicKey, transaction?: Transaction, feePayer?: PublicKey) {
        this._transaction = transaction ? transaction : new Transaction();
        this._connection = connection;
        this._signer = signer;
        this._feePayer = feePayer;
    }

    public static create({
        transaction,
        rpcEndpoint,
        connection,
        connectionManager,
        signer,
        config,
        changeConn = false
    }: {
        transaction?: Transaction;
        rpcEndpoint?: string;
        connection?: Connection;
        connectionManager?: ConnectionManager;
        signer?: PublicKey;
        config?: ConnectionConfig;
        changeConn?: boolean;
    }): TransactionWrapper {
        var conn: Connection;

        if (connection) {
            conn = connection;
        } else if (rpcEndpoint) {
            conn = new Connection(rpcEndpoint, config);
        } else if (connectionManager) {
            conn = connectionManager.conn({ changeConn });
        } else {
            throw new Error('No connection or rpc endpoint provided');
        }

        return new TransactionWrapper(conn, signer, transaction);
    }

    public async sendAndConfirm({
        serialisedTx,
        maximumRetries = 5,
        commitment = 'max'
    }: {
        serialisedTx: Uint8Array | Buffer | number[];
        maximumRetries?: number;
        commitment?: Commitment;
    }): Promise<string> {
        var signature: string | undefined;
        var tries = 0;
        var isTransactionConfirmed = false;
        while (
            tries < maximumRetries && // not exceeded max retries
            !isTransactionConfirmed // no confirmation of any signature
        ) {
            try {
                signature = await this.sendTx({ serialisedTx });
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
        this._transaction.recentBlockhash = latestBlockhash.blockhash;
        this._transaction.feePayer = feePayer || this._feePayer || this._signer;

        if (this._transaction.feePayer === undefined) {
            throw new Error('Fee payer must be defined');
        }

        // this._logger.debug('blockhash:', this._transaction.recentBlockhash);
        // this._logger.debug('fee payer:', this._transaction.feePayer.toBase58());

        return this;
    }

    public async sign({
        wallet,
        signer,
        tx
    }: {
        wallet?: IWallet;
        signer?: Signer;
        tx?: Transaction;
    }): Promise<Transaction> {
        if (!wallet && !signer) {
            throw new Error('No wallet or signer provided');
        }

        if (tx === undefined) {
            tx = this._transaction;
        }

        if (wallet) {
            var signedTx = await wallet.signTransaction(tx);
            return signedTx!;
        } else if (signer) {
            tx.sign(signer);
            return tx;
        } else {
            throw new Error('Wallet or Signer must be provided');
        }
    }

    public async sendTx({ serialisedTx }: { serialisedTx: Uint8Array | Buffer | number[] }) {
        var sig = await this._connection.sendRawTransaction(serialisedTx);
        return sig;
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
            connection = connectionManager.conn({ changeConn, airdrop });
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
