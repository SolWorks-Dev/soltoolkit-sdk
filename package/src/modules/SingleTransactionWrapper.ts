import { Transaction, Connection, PublicKey, ConnectionConfig, Commitment, Signer, VersionedTransaction } from '@solana/web3.js';
import { IWallet } from '../interfaces/IWallet';
import { ConnectionManager } from './ConnectionManager';

/**
 * Represents a wrapper class for a single transaction.
 */
export class SingleTransactionWrapper {
    private _transaction: Transaction | VersionedTransaction | Buffer | undefined;
    private _connections: Connection[] = [];
    private _shouldAddBlockhash = true;
    private _shouldAddFeePayer = true;
    private _shouldSign = true;
    private _shouldConfirm = true;

    private constructor() { }
    public create() { return new SingleTransactionWrapper(); }
    public setTransaction(transaction: Transaction | VersionedTransaction | Buffer) {
        this._transaction = transaction;
        return this;
    }
    public setConnections(connections: Connection[]) {
        this._connections = connections;
        return this;
    }
    public addConnection(connection: Connection | ConnectionManager | string, config?: ConnectionConfig | Commitment | undefined) {
        if (connection instanceof Connection) {
            this._connections.push(connection);
        } else if (connection instanceof ConnectionManager) {
            this._connections.push(connection.connSync({}));
        } else if (typeof connection === 'string') {
            this._connections.push(new Connection(connection, config));
        } else {
            throw new Error('Invalid connection');
        }
        return this;
    }
    public setShouldAddBlockhash(shouldAddBlockhash: boolean) {
        this._shouldAddBlockhash = shouldAddBlockhash;
        return this;
    }
    public setShouldAddFeePayer(shouldAddFeePayer: boolean) {
        this._shouldAddFeePayer = shouldAddFeePayer;
        return this;
    }
    public setShouldSign(shouldSign: boolean) {
        this._shouldSign = shouldSign;
        return this;
    }
    public setShouldConfirm(shouldConfirm: boolean) {
        this._shouldConfirm = shouldConfirm;
        return this;
    }
    public setBlockhash(blockhash: string) {
        if (this._transaction instanceof Transaction) {
            this._transaction.recentBlockhash = blockhash;
        } else if (this._transaction instanceof VersionedTransaction) {
            this._transaction.message.recentBlockhash = blockhash;
        } else if (this._transaction instanceof Buffer) {
            throw new Error('Cannot set blockhash for already serialized transaction');
        } else {
            throw new Error('Invalid transaction type');
        }
        return this;
    }
    public setFeePayer(feePayer: PublicKey) {
        if (this._transaction instanceof Transaction) {
            this._transaction.feePayer = feePayer;
        } else if (this._transaction instanceof VersionedTransaction || this._transaction instanceof Buffer) {
            throw new Error('Cannot set fee payer for VersionedTransaction or serialized transaction');
        } else {
            throw new Error('Invalid transaction type');
        }
        return this;
    }
    public async send({
        wallet, signer, signers, confirmationCommitment, blockhashOverride, feePayerOverride, shouldConfirmOverride, shouldRaceSend, skipPreflight
    }: {
        wallet?: IWallet;
        signer?: Signer;
        signers?: Signer[];
        confirmationCommitment?: Commitment; // default is 'max'
        blockhashOverride?: string;
        feePayerOverride?: PublicKey;
        shouldConfirmOverride?: boolean;
        shouldRaceSend?: boolean;
        skipPreflight?: boolean;
    }) {
        // validate transaction has been set/has instructions
        if (this._transaction === undefined) {
            throw new Error('Transaction is undefined');
        }
        if (this._transaction instanceof Transaction && this._transaction.instructions.length === 0) {
            throw new Error('Transaction has no instructions');
        }
        if (this._transaction instanceof VersionedTransaction && this._transaction.message.compiledInstructions.length === 0) {
            throw new Error('Transaction has no instructions');
        }

        // validate at least one connection has been set
        if (this._connections.length === 0) {
            throw new Error('No connections provided');
        }

        // get blockhash if needed
        let blockhash: string | undefined;
        if (this._shouldAddBlockhash || blockhashOverride !== undefined) {
            blockhash = blockhashOverride || (await this._connections[0].getLatestBlockhash({
                commitment: confirmationCommitment || 'max'
            })).blockhash;
        }

        // add blockhash to transaction
        if (this._transaction instanceof Transaction && this._shouldAddBlockhash) {
            this._transaction.recentBlockhash = blockhash!;
        } else if (this._transaction instanceof VersionedTransaction && this._shouldAddBlockhash) {
            this._transaction.message.recentBlockhash = blockhash!;
        }

        // add fee payer to transaction if needed
        if (this._transaction instanceof Transaction && this._shouldAddFeePayer && feePayerOverride !== undefined) {
            this._transaction.feePayer = feePayerOverride;
        }

        // sign transaction if needed
        if (this._shouldSign && (wallet || signer || signers) && (this._transaction instanceof Transaction || this._transaction instanceof VersionedTransaction)) {
            if (wallet && this._transaction instanceof Transaction) {
                this._transaction = await wallet.signTransaction(this._transaction);
            } else if (signer) {
                if (this._transaction instanceof Transaction) {
                    this._transaction.sign(signer);
                } else if (this._transaction instanceof VersionedTransaction) {
                    this._transaction.sign([signer]);
                }
            } else if (signers) {
                for (const s of signers) {
                    if (this._transaction instanceof Transaction) {
                        this._transaction.sign(s);
                    } else if (this._transaction instanceof VersionedTransaction) {
                        this._transaction.sign([s]);
                    }
                }
            }
        }

        // send transaction
        let signatures: string[] = [];
        if (shouldRaceSend) {
            await Promise.race(this._connections.map(async (conn) => {
                let signature = await this.sendTransaction(skipPreflight, conn);
                signatures.push(signature);
            }));
        } else {
            let signature = await this.sendTransaction(skipPreflight, this._connections[0]);
            signatures.push(signature);
        }

        // confirm transaction if needed
        if (this._shouldConfirm && shouldConfirmOverride && signatures.length > 0 && shouldRaceSend === false) {
            await Promise.all(signatures.map(async (sig) => {
                return await this._connections[0].confirmTransaction(sig, confirmationCommitment || 'max');
            }));
        } else if (this._shouldConfirm && shouldConfirmOverride && signatures.length > 0 && shouldRaceSend) {
            await Promise.all(this._connections.map(async (conn) => {
                return await Promise.all(signatures.map(async (sig) => {
                    return await conn.confirmTransaction(sig, confirmationCommitment || 'max');
                }));
            }));
        }

        return signatures;
    }
    private async sendTransaction(skipPreflight: boolean | undefined, connection: Connection) {
        connection = connection || this._connections[0];
        let signature: string | undefined;
        if (this._transaction instanceof Transaction) {
            signature = await this._connections[0].sendRawTransaction(this._transaction.serialize(), {
                skipPreflight: skipPreflight || false
            });
        } else if (this._transaction instanceof VersionedTransaction) {
            signature = await this._connections[0].sendTransaction(this._transaction, { skipPreflight: skipPreflight || false });
        } else if (this._transaction instanceof Buffer) {
            signature = await this._connections[0].sendRawTransaction(this._transaction, {
                skipPreflight: skipPreflight || false
            });
        } else {
            throw new Error('Invalid transaction type');
        }
        return signature;
    }
}
