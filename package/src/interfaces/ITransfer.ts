export interface ITransfer {
    recipient: string;
    amount: number; // lamports
    associatedTokenAccount?: string; // optional for spl
}