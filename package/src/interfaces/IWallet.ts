import { Transaction, PublicKey } from '@solana/web3.js';
export interface IWallet {
    signTransaction(tx: Transaction): Promise<Transaction> | undefined;
    signAllTransactions(txs: Transaction[]): Promise<Transaction[]> | undefined;
    publicKey: PublicKey | null;
}