import { Logger } from "../package/src/modules/Logger";
import { Commitment, Keypair, LAMPORTS_PER_SOL, Signer, Transaction } from "@solana/web3.js";
import {
  ConnectionManager,
  Disperse,
  TransactionWrapper,
} from "../package/src/index";
import { ITransfer } from "../package/src/interfaces/ITransfer";

const COMMITMENT: Commitment = 'confirmed';
const NO_OF_RECEIVERS = 1_000;
const CHUNK_SIZE = 30;

// generate keypair for example
const sender = Keypair.generate();

(async () => {
  const logger = new Logger("example");

  // create connection manager
  const cm = await ConnectionManager.getInstance({
    commitment: COMMITMENT,
    endpoints: [
      "https://mango.devnet.rpcpool.com",
      
      // https://docs.solana.com/cluster/rpc-endpoints
      // Maximum number of requests per 10 seconds per IP: 100 (10/s)
      // Maximum number of requests per 10 seconds per IP for a single RPC: 40 (4/s)
      // Maximum concurrent connections per IP: 40
      // Maximum connection rate per 10 seconds per IP: 40
      // Maximum amount of data per 30 second: 100 MB
      // "https://api.devnet.solana.com",

      // https://shdw.genesysgo.com/genesysgo/the-genesysgo-rpc-network
      // SendTransaction Limit: 10 RPS + 200 Burst
      // getProgramAccounts Limit: 15 RPS + 5 burst
      // Global Limit on the rest of the calls: 200 RPS
      "https://devnet.genesysgo.net"    
    ],
    mode: "round-robin",
    network: "devnet"
  });

  // airdrop sol to the generated address
  const airdropSig = await cm
    .conn({ airdrop: true })
    .requestAirdrop(sender.publicKey, LAMPORTS_PER_SOL);
    logger.debug("Airdropped 1 SOL to", sender.publicKey.toBase58());

  // confirm airdrop tx
  logger.debug("Confirming airdrop transaction...");
  await TransactionWrapper.confirmTx({
    connectionManager: cm,
    changeConn: false,
    signature: airdropSig,
    commitment: COMMITMENT,
    airdrop: true,
  });
  logger.debug("Airdrop transaction confirmed");

  // fetch balance of the generated address
  logger.debug("Fetching balance of", sender.publicKey.toBase58());
  let senderBal = await cm
    // default value for changeConn = true
    .conn({ changeConn: true })
    .getBalance(sender.publicKey, COMMITMENT);
  logger.debug(`Sender balance: ${senderBal}`);

  // generate receivers
  logger.debug("Generating receivers...");
  const receivers: Keypair[] = [];
  for (let i = 0; i < NO_OF_RECEIVERS; i++) {
    receivers.push(Keypair.generate());
  }
  logger.debug("Receivers generated");

  // generate transactions
  const transfers: ITransfer[] = [];
  const rentCost = NO_OF_RECEIVERS * 5_000;
  const transferAmount = Math.floor((LAMPORTS_PER_SOL - rentCost) / NO_OF_RECEIVERS);
  logger.debug(`Sending ${transferAmount} to ${NO_OF_RECEIVERS} receivers`);
  for (let i = 0; i < NO_OF_RECEIVERS; i++) {
    transfers.push({
      amount: transferAmount,
      recipient: receivers[i].publicKey.toBase58(),
    });
  }
  const transactions = await Disperse.create({
    tokenType: "SOL",
    sender: sender.publicKey,
    // recipients: receivers.map((r) => r.publicKey),
    // fixedAmount: 10,
    transfers
  }).generateTransactions();

  // send transactions
  // reuse connection
  const txChunks = chunk(transactions, CHUNK_SIZE);
  
  for (let i = 0; i < txChunks.length; i++) {
    logger.debug(`Sending transactions ${i + 1}/${txChunks.length}`);
    const txChunk = txChunks[i];
    const conn = cm.conn({ changeConn: true });

    await Promise.all(
      txChunk.map(async (tx: Transaction, i: number) => {
        logger.debug(`Sending transaction ${i + 1}`);

        // feed transaction into TransactionWrapper
        const wrapper = TransactionWrapper.create({
          connection: conn,
          transaction: tx,
          signer: sender.publicKey,
        });

        // add fee payer and blockhash
        const txWithBlockhash = await wrapper.addBlockhashAndFeePayer();

        // sign the transaction
        logger.debug(`Signing transaction ${i + 1}`);
        const signedTx = await wrapper.sign({
          signer: sender as Signer,
          tx: txWithBlockhash,
        });

        // send and confirm the transaction
        logger.debug(`Sending transaction ${i + 1}`);
        const transferSig = await wrapper.sendAndConfirm({
          serialisedTx: signedTx.serialize(),
          commitment: COMMITMENT,
        });
        logger.debug("Transaction sent:", transferSig.toString());
      })
    );
    await sleep(1_000);
  }

  // // fetch balance of the generated address
  // logger.debug("Fetching balance of:", sender.publicKey.toBase58());
  // senderBal = await cm
  //   .conn({ changeConn: true })
  //   .getBalance(sender.publicKey, COMMITMENT);
  // logger.debug(`Sender balance: ${senderBal}`);

  // // split addresses into chunks of CHUNK_SIZE
  // const chunks = chunk(receivers, CHUNK_SIZE);
  // const balances: {
  //   balance: number;
  //   address: string;
  // }[] = [];
  // for (let i = 0; i < chunks.length; i++) {
  //   const chunk = chunks[i];
  //   logger.debug(
  //     `Fetching balances for chunk ${i + 1} with ${chunk.length} addresses`
  //   );

  //   // cycle to new connection to avoid rate limiting
  //   let conn = cm.conn({ changeConn: true });

  //   // fetch balances
  //   const results = await Promise.all(
  //     chunk.map(async (receiver: Keypair) => {
  //       const balance = await conn.getBalance(receiver.publicKey, COMMITMENT);
  //       logger.debug(`Balance of ${receiver.publicKey.toBase58()}: ${balance}`);
  //       return {
  //         balance,
  //         address: receiver.publicKey.toBase58(),
  //       };
  //     })
  //   );

  //   // add results to balances
  //   balances.push(...results);
  //   await sleep(1_000);
  // }

  // const totalBalance = balances.reduce((acc, curr) => acc + curr.balance, 0);
  // const numberWithNoBalance = balances.filter((b) => b.balance === 0).length;
  // const numberWithBalance = balances.filter((b) => b.balance > 0).length;
  // logger.debug(`Total amount sent: ${totalBalance}`);
  // logger.debug(`Number of addresses with no balance: ${numberWithNoBalance}`);
  // logger.debug(`Number of addresses with balance: ${numberWithBalance}`);
})();

function chunk(arr: any[], len: number) {
  var chunks: any[] = [],
    i = 0,
    n = arr.length;

  while (i < n) {
    chunks.push(arr.slice(i, (i += len)));
  }
  return chunks;
}


function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}