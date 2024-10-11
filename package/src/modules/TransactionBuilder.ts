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

export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

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
        if (accInfo === null) {
            const ix = createAssociatedTokenAccountInstruction(payer, associatedAddr, owner, mint);
            this.addIx(ix);
        } else {
            this._logger.info(`Token account already exists: ${associatedAddr.toBase58()}`);
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

    public addSplTransferIxByOwners({
        mint,
        fromOwner,
        toOwner,
        rawAmount,
        additionalSigners
    }: {
        mint: PublicKey;
        fromOwner: PublicKey;
        toOwner: PublicKey;
        rawAmount: number;
        additionalSigners?: Signer[];
    }) {
        // get associated token accounts
        const fromTokenAccount = getAssociatedTokenAddressSync(mint, fromOwner);
        const toTokenAccount = getAssociatedTokenAddressSync(mint, toOwner);
        // create transfer instruction
        const ix = createTransferInstruction(
            fromTokenAccount, 
            toTokenAccount, 
            fromOwner, 
            rawAmount, 
            additionalSigners
        );
        // add instruction to the list
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

    public addComputeBudgetIx({ 
        units, 
        priceInMicroLamports
    }: { 
        units: number; 
        priceInMicroLamports: number;
    }) {
        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
            units
        });
        const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: priceInMicroLamports
        });
        this._instructions.unshift(modifyComputeUnits, addPriorityFee);
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
