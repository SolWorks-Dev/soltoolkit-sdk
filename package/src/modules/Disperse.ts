import { PublicKey, Transaction } from '@solana/web3.js';
import { ILogger } from '../interfaces/ILogger';
import { ITransfer } from '../interfaces/ITransfer';
import { Logger } from './Logger';
import { TransactionBuilder } from './TransactionBuilder';

type TokenType = 'SOL' | 'SPL';

export class Disperse {
    private _config: IDisperseConstructor;
    private _logger: ILogger = new Logger('@soltoolkit/Disperse');

    private constructor(values: IDisperseConstructor) {
        this._logger.debug(`Disperse constructor called with values: ${JSON.stringify(values, null, 2)}`);
        this._config = values;
    }

    public static create(values: IDisperseConstructor): Disperse {
        return new Disperse(values);
    }

    public async generateTransactions(): Promise<Transaction[]> {
        const transactions: Transaction[] = [];
        const { tokenType, transfers, sender, fixedAmount, recipients } = this._config;
        switch (tokenType) {
            case 'SOL':
                {
                    // bundle 18 ixs per tx
                    let txBuilder = TransactionBuilder.create();
                    if (fixedAmount) {
                        if (recipients === undefined) {
                            throw new Error('recipients must be defined if fixedAmount is true');
                        } else {
                            for (let x = 0; x < recipients.length; x++) {
                                // add ix
                                txBuilder = txBuilder.addSolTransferIx({
                                    from: sender,
                                    to: new PublicKey(recipients[x]),
                                    amountLamports: fixedAmount
                                });
                                // check if tx is full
                                if (x % 18 === 0 || x === recipients.length-1) {
                                    txBuilder = txBuilder.addMemoIx({
                                        memo: "gm! Testing SolToolkit's Disperse module build dispersing SOL 👀",
                                        signer: sender,
                                      })
                                    this._logger.debug(`Creating new transaction for SOL transfer ${x}`);
                                    transactions.push(txBuilder.build());
                                    txBuilder = txBuilder.reset();
                                }
                            }
                        }

                    } else {
                        if (transfers === undefined) {
                            throw new Error('transfers must be defined if fixedAmount is false');
                        }

                        for (var x = 0; x < transfers.length; x++) {
                            this._logger.debug(`Adding SOL ix ${x} to existing transaction`);
    
                            txBuilder = txBuilder.addSolTransferIx({
                                from: sender,
                                to: new PublicKey(transfers[x].recipient),
                                amountLamports: transfers[x].amount
                            });
    
                            if (x % 18 === 0 || x === transfers.length-1) {
                                txBuilder = txBuilder.addMemoIx({
                                    memo: "gm! Testing SolToolkit with the Disperse module 👀",
                                    signer: sender,
                                  })
                                this._logger.debug(`Creating new transaction for SOL transfer ${x}`);
                                transactions.push(txBuilder.build());
                                txBuilder = txBuilder.reset();
                            }
                        }
                    }
                }
                break;
            case 'SPL':
                throw new Error('SPL token type not yet implemented');
            default:
                throw new Error(`Invalid token type: ${tokenType}`);
        }
        return transactions;
    }
}

export class DisperseParser {
    private constructor() {}
}

interface IDisperseConstructor {
    tokenType: TokenType;
    mint?: PublicKey;
    maximumAmount?: number;
    transfers?: ITransfer[];
    recipients?: PublicKey[];
    fixedAmount?: number;
    sender: PublicKey;
}
