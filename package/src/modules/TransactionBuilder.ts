import {
    createAssociatedTokenAccountInstruction,
    createTransferInstruction,
    getAssociatedTokenAddressSync
} from '@solana/spl-token';
import {
    Transaction,
    TransactionInstruction,
    Connection,
    PublicKey,
    SystemProgram,
    Signer,
    ComputeBudgetProgram
} from '@solana/web3.js';
import { ILogger } from '../interfaces/ILogger';
import { ConnectionManager } from './ConnectionManager';
import { Logger } from './Logger';

const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

export class TransactionBuilder {
    private _transaction: Transaction;
    private _instructions: TransactionInstruction[];
    private _logger: ILogger = new Logger('@soltoolkit/TransactionBuilder');

    private constructor() {
        this._transaction = new Transaction();
        this._instructions = [];
    }

    public static create(): TransactionBuilder {
        return new TransactionBuilder();
    }

    public async addCreateTokenAccountIx({
        connectionOrConnectionManager,
        mint,
        owner,
        payer
    }: {
        connectionOrConnectionManager: Connection | ConnectionManager;
        mint: PublicKey;
        owner: PublicKey;
        payer: PublicKey;
    }): Promise<TransactionBuilder> {
        var connection: Connection;
        if (connectionOrConnectionManager instanceof Connection) {
            connection = connectionOrConnectionManager;
        } else if (connectionOrConnectionManager instanceof ConnectionManager) {
            connection = connectionOrConnectionManager._connection;
        } else {
            throw new Error('Invalid connectionOrConnectionManager');
        }

        const associatedAddr = getAssociatedTokenAddressSync(mint, owner);
        const accInfo = await connection.getAccountInfo(associatedAddr);
        if (accInfo !== null) {
            const ix = createAssociatedTokenAccountInstruction(payer, associatedAddr, owner, mint);
            this.addIx(ix);
        }
        return this;
    }

    public addSolTransferIx({ from, to, amountLamports }: { from: PublicKey; to: PublicKey; amountLamports: number }) {
        const ix = SystemProgram.transfer({
            fromPubkey: from,
            toPubkey: to,
            lamports: amountLamports
        });
        this.addIx(ix);
        return this;
    }

    public addSplTransferIx({
        fromTokenAccount,
        toTokenAccount,
        rawAmount,
        owner,
        additionalSigners
    }: {
        fromTokenAccount: PublicKey;
        toTokenAccount: PublicKey;
        rawAmount: number;
        owner: PublicKey;
        additionalSigners?: Signer[];
    }) {
        const ix = createTransferInstruction(fromTokenAccount, toTokenAccount, owner, rawAmount, additionalSigners);
        this.addIx(ix);
        return this;
    }

    public addMemoIx({ memo, signer }: { memo: string; signer: PublicKey }) {
        const ix = new TransactionInstruction({
            keys: [{ pubkey: signer, isSigner: true, isWritable: true }],
            data: Buffer.from(memo),
            programId: new PublicKey(MEMO_PROGRAM_ID)
        });
        this.addIx(ix);
        return this;
    }

    public addComputeBudgetIx({ units }: { units: number }) {
        const ix = ComputeBudgetProgram.requestUnits({
            units,
            additionalFee: 0
        });
        this._instructions.unshift(ix);
        return this;
    }

    public addIx(instruction: TransactionInstruction | TransactionInstruction[]): TransactionBuilder {
        this._instructions = this._instructions.concat(instruction);
        this.logNumberOfIxs();
        return this;
    }

    public reset(): TransactionBuilder {
        this._transaction = new Transaction();
        this._instructions = [];
        this._logger.warn('resetting builder');
        return this;
    }

    public build(): Transaction {
        this.logNumberOfIxs();
        this._transaction.instructions = this._instructions;
        return this._transaction;
    }

    private logNumberOfIxs = () => this._logger.debug(`instruction count: ${this._instructions.length}`);
}
