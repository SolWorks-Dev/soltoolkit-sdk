import {
  Commitment,
  Keypair,
  LAMPORTS_PER_SOL,
  Signer,
  Transaction,
} from "@solana/web3.js";
import {
  ConnectionManager,
  Disperse,
  TransactionBuilder,
  TransactionWrapper,
  Logger
} from "@solworks/soltoolkit-sdk";

const COMMITMENT: Commitment = "confirmed";
const NO_OF_RECEIVERS = 10_000;
const CHUNK_SIZE = 30;
const TOTAL_SOL = 10;

const SKIP_AIRDROP = true;
const SKIP_SENDING = false;
const SKIP_BALANCE_CHECK = true;

// generate keypair for example
const sender = Keypair.fromSecretKey(
  Uint8Array.from([
    36, 50, 153, 146, 147, 239, 210, 72, 199, 68, 75, 220, 42, 139, 105, 61,
    148, 117, 55, 75, 23, 144, 30, 206, 138, 255, 51, 206, 102, 239, 73, 28,
    240, 73, 69, 190, 238, 27, 112, 36, 151, 255, 182, 64, 13, 173, 94, 115,
    111, 45, 2, 154, 250, 93, 100, 44, 251, 111, 229, 34, 193, 249, 199, 238,
  ])
);

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
      "https://devnet.genesysgo.net",
    ],
    mode: "round-robin",
    network: "devnet",
  });

  if (!SKIP_AIRDROP) {
    // airdrop 1 sol to new addresses, confirm and send sol to SENDER
    for (let i = 0; i < Math.ceil((TOTAL_SOL + 1) / 1); i++) {
      // generate new keypair
      const keypair = Keypair.generate();

      // airdrop sol to the generated address
      const airdropSig = await cm
        .connSync({ airdrop: true })
        .requestAirdrop(keypair.publicKey, LAMPORTS_PER_SOL);
      logger.debug("Airdropped 1 SOL to", sender.publicKey.toBase58());

      // wait for confirmation
      logger.debug("Confirming airdrop transaction...");
      await TransactionWrapper.confirmTx({
        connectionManager: cm,
        changeConn: false,
        signature: airdropSig,
        commitment: "max",
        airdrop: true,
      });
      logger.debug("Airdrop transaction confirmed");

      // send sol to SENDER
      const tx = TransactionBuilder.create()
        .addSolTransferIx({
          from: keypair.publicKey,
          to: sender.publicKey,
          amountLamports: LAMPORTS_PER_SOL - 5000,
        })
        .build();

      const wrapper = await TransactionWrapper.create({
        connectionManager: cm,
        changeConn: false,
        signer: keypair.publicKey,
        transaction: tx,
      }).addBlockhashAndFeePayer(keypair.publicKey);
      const signedTx = await wrapper.sign({ signer: keypair as Signer });
      const sig = await wrapper.sendAndConfirm({
        serialisedTx: signedTx.serialize(),
        commitment: "max",
      });
      logger.debug(
        "Sent 1 SOL to",
        sender.publicKey.toBase58(),
        "with signature",
        sig
      );

      await sleep(1000);
    }
  }

  // fetch balance of the generated address
  logger.debug("Fetching balance of", sender.publicKey.toBase58());
  let senderBal = await cm
    // default value for changeConn = true
    .connSync({ changeConn: true })
    .getBalance(sender.publicKey, COMMITMENT);
  logger.debug(`Sender balance: ${senderBal}`);

  // generate receivers
  logger.debug(`Generating ${NO_OF_RECEIVERS} receivers...`);
  const receivers: Keypair[] = [];
  for (let i = 0; i < NO_OF_RECEIVERS; i++) {
    receivers.push(Keypair.generate());
  }
  logger.debug("Receivers generated");

  // generate transactions
  const transfers: {
    amount: number;
    recipient: string;
  }[] = [];

  const rentCost = (NO_OF_RECEIVERS+1) * 5_000;
  const transferAmount = Math.floor(
    (senderBal - rentCost) / NO_OF_RECEIVERS
  );
  logger.debug(`Sending ${transferAmount} to ${NO_OF_RECEIVERS} receivers`);
  for (let i = 0; i < NO_OF_RECEIVERS; i++) {
    transfers.push({
      amount: transferAmount,
      recipient: receivers[i].publicKey.toBase58(),
    });
  }

  // send transactions
  if (!SKIP_SENDING) {
    const transactions = await Disperse.create({
      tokenType: "SOL",
      sender: sender.publicKey,
      transfers,
    }).generateTransactions();

    const txChunks = chunk(transactions, CHUNK_SIZE);
    for (let i = 0; i < txChunks.length; i++) {
      logger.debug(`Sending transactions ${i + 1}/${txChunks.length}`);
      const txChunk = txChunks[i];
      const conn = cm.connSync({ changeConn: true });

      await Promise.all(
        txChunk.map(async (tx: Transaction, i: number) => {
          logger.debug(`Sending transaction ${i + 1}`);

          // feed transaction into TransactionWrapper
          const wrapper = await TransactionWrapper.create({
            connection: conn,
            transaction: tx,
            signer: sender.publicKey,
          }).addBlockhashAndFeePayer(sender.publicKey);

          // sign the transaction
          logger.debug(`Signing transaction ${i + 1}`);
          const signedTx = await wrapper.sign({
            signer: sender as Signer,
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
  }

  if (!SKIP_BALANCE_CHECK) {
    // fetch balance of the generated address
    logger.debug("Fetching balance of:", sender.publicKey.toBase58());
    senderBal = await cm
      .connSync({ changeConn: true })
      .getBalance(sender.publicKey, COMMITMENT);
    logger.debug(`Sender balance: ${senderBal}`);

    // split addresses into chunks of CHUNK_SIZE
    const chunks = chunk(receivers, CHUNK_SIZE);
    const balances: {
      balance: number;
      address: string;
    }[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      logger.debug(
        `Fetching balances for chunk ${i + 1} with ${chunk.length} addresses`
      );

      // cycle to new connection to avoid rate limiting
      let conn = cm.connSync({ changeConn: true });

      // fetch balances
      const results = await Promise.all(
        chunk.map(async (receiver: Keypair) => {
          const balance = await conn.getBalance(receiver.publicKey, COMMITMENT);
          logger.debug(
            `Balance of ${receiver.publicKey.toBase58()}: ${balance}`
          );
          return {
            balance,
            address: receiver.publicKey.toBase58(),
          };
        })
      );

      // add results to balances
      balances.push(...results);
      await sleep(1_000);
    }

    const totalBalance = balances.reduce((acc, curr) => acc + curr.balance, 0);
    const numberWithNoBalance = balances.filter((b) => b.balance === 0).length;
    const numberWithBalance = balances.filter((b) => b.balance > 0).length;
    logger.debug(`Total amount sent: ${totalBalance}`);
    logger.debug(`Number of addresses with no balance: ${numberWithNoBalance}`);
    logger.debug(`Number of addresses with balance: ${numberWithBalance}`);
  }
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
