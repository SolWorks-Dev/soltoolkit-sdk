import { ComputeBudgetProgram, Connection, PublicKey, Signer, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { ConnectionManager } from "./ConnectionManager";
import { createAssociatedTokenAccountInstruction, createTransferInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { MEMO_PROGRAM_ID } from "./TransactionBuilder";

/**
 * Helper class for building Solana transactions.
 */
export class TransactionHelper {
    /**
     * Sourced from: https://solana.stackexchange.com/questions/5628/is-there-a-way-to-estimate-the-transaction-size
     * @param tx a solana transaction
     * @param feePayer the publicKey of the signer
     * @returns size in bytes of the transaction
     */
    public static getTxSize(tx: Transaction, feePayer: PublicKey): number {
        const feePayerPk = [feePayer.toBase58()];

        const signers = new Set<string>(feePayerPk);
        const accounts = new Set<string>(feePayerPk);

        const ixsSize = tx.instructions.reduce((acc, ix) => {
            ix.keys.forEach(({ pubkey, isSigner }) => {
                const pk = pubkey.toBase58();
                if (isSigner) signers.add(pk);
                accounts.add(pk);
            });

            accounts.add(ix.programId.toBase58());

            const nIndexes = ix.keys.length;
            const opaqueData = ix.data.length;

            return (
                acc +
                1 + // PID index
                this.compactArraySize(nIndexes, 1) +
                this.compactArraySize(opaqueData, 1)
            );
        }, 0);

        return (
            this.compactArraySize(signers.size, 64) + // signatures
            3 + // header
            this.compactArraySize(accounts.size, 32) + // accounts
            32 + // blockhash
            this.compactHeader(tx.instructions.length) + // instructions
            ixsSize
        );
    }

    // COMPACT ARRAY
    static LOW_VALUE = 127; // 0x7f
    static HIGH_VALUE = 16383; // 0x3fff

    /**
    * Compact u16 array header size
    * @param n elements in the compact array
    * @returns size in bytes of array header
    */
    static compactHeader = (n: number) => (n <= this.LOW_VALUE ? 1 : n <= this.HIGH_VALUE ? 2 : 3);

    /**
    * Compact u16 array size
    * @param n elements in the compact array
    * @param size bytes per each element
    * @returns size in bytes of array
    */
    static compactArraySize = (n: number, size: number) => this.compactHeader(n) + n * size;

    /**
     * Creates a token account creation instruction if account does not exist already.
     * @param connectionOrConnectionManager The connection or connection manager.
     * @param mint The mint public key.
     * @param owner The owner public key.
     * @param payer The payer public key.
     * @returns A promise that resolves to a TransactionInstruction or null.
     */
    public static async createTokenAccountIx({
        connectionOrConnectionManager,
        mint,
        owner,
        payer
    }: {
        connectionOrConnectionManager: Connection | ConnectionManager;
        mint: PublicKey;
        owner: PublicKey;
        payer: PublicKey;
    }): Promise<TransactionInstruction | null> {
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
            return ix;
        } else {
            return null;
        }
    }

    /**
     * Creates a Solana transfer instruction.
     * @param from The public key of the sender.
     * @param to The public key of the recipient.
     * @param amountLamports The amount of lamports to transfer.
     * @returns The transfer instruction.
     */
    public static createSolTransferIx({
        from,
        to,
        amountLamports
    }: { 
        from: PublicKey; 
        to: PublicKey; 
        amountLamports: number;
    }): TransactionInstruction {
        return SystemProgram.transfer({
            fromPubkey: from,
            toPubkey: to,
            lamports: amountLamports
        });
    }

    /**
     * Creates a transaction instruction for transferring SPL tokens.
     * 
     * @param fromTokenAccount The public key of the token account to transfer from.
     * @param toTokenAccount The public key of the token account to transfer to.
     * @param rawAmount The amount of tokens to transfer.
     * @param owner The public key of the account that owns the token account.
     * @param additionalSigners (Optional) An array of additional signers for the transaction.
     * @returns The transfer instruction.
     */
    public static createSplTransferIx({
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
    }): TransactionInstruction {
        return createTransferInstruction(fromTokenAccount, toTokenAccount, owner, rawAmount, additionalSigners);
    }

    /**
     * Creates a memo instruction.
     * 
     * @param memo The memo to include in the instruction.
     * @param signer The public key of the signer.
     * @returns The memo instruction.
     */
    public static createMemoIx({ 
        memo,
        signer 
    }: { 
        memo: string; 
        signer: PublicKey;
    }): TransactionInstruction {
        return new TransactionInstruction({
            keys: [{ pubkey: signer, isSigner: true, isWritable: true }],
            data: Buffer.from(memo),
            programId: new PublicKey(MEMO_PROGRAM_ID)
        });
    }

    /**
     * Creates a compute budget instruction.
     * 
     * @param units The number of compute units to request.
     * @returns The compute budget instruction.
     */
    public static addComputeBudgetIx({ 
        units 
    }: { 
        units: number;
    }): TransactionInstruction {
        const ix = ComputeBudgetProgram.requestUnits({
            units,
            additionalFee: 0
        });
        return ix;
    }
}