import {
  Commitment,
  Keypair,
  LAMPORTS_PER_SOL,
  Signer,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ConnectionManager,
  TransactionWrapper,
  Logger,
  TransactionBuilder,
} from "@solworks/soltoolkit-sdk";
import {
  createAssociatedTokenAccountInstruction,
  createMint,
  mintToChecked,
  createAssociatedTokenAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";

const COMMITMENT: Commitment = "processed"; // "processed" is the fastest, "max" is ideal but takes longer
const NO_OF_RECEIVERS = 10_000; // number of users to airdrop to
const CHUNK_SIZE = 15; // transactions sent at once
const DELAY_BETWEEN_CHUNKS_MS = 5_000; // x/100 seconds
const SKIP_SENDING = false; // send transactions
const SKIP_BALANCE_CHECK = true; // fetch balance after sending
const TOKEN_DECIMALS = 8; // decimals for SPL token
// max tokens to mint
const MAX_TOKENS = 1_000_000 * 10 ** TOKEN_DECIMALS;

// swap with your own keypair or load from file
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
  const cm = await ConnectionManager.getInstance({
    commitment: COMMITMENT,
    endpoint: "https://api.devnet.solana.com",
    mode: "single",
    network: "devnet",
  });

  // airdrop sol to the generated address (devnet only)
  // this can error if the RPC doesn't have airdrop enabled
  let airdropSig = await cm
    .connSync({ airdrop: true })
    .requestAirdrop(sender.publicKey, LAMPORTS_PER_SOL);
  logger.debug("Airdropped 1 SOL to", sender.publicKey.toBase58());

  logger.debug("Confirming airdrop transaction...");
  await TransactionWrapper.confirmTx({
    connectionManager: cm,
    changeConn: false,
    signature: airdropSig,
    commitment: "max",
    airdrop: true,
  });
  logger.debug("Airdrop transaction confirmed");

  // get SOL balance of sender
  logger.debug("Fetching SOL balance of", sender.publicKey.toBase58());
  let senderSOLBal = await cm
    .connSync({ changeConn: false })
    .getBalance(sender.publicKey, COMMITMENT);
  logger.debug(`Sender balance: ${senderSOLBal / LAMPORTS_PER_SOL} SOL`);

  // create mint account and tx for initializing it
  let mint = await createMint(
    cm.connSync({ changeConn: false }),
    sender,
    sender.publicKey,
    sender.publicKey,
    TOKEN_DECIMALS
  );
  logger.debug(`Mint created: ${mint.toBase58()}`);

  // create associated token account
  let associatedAddr = await createAssociatedTokenAccount(
    cm.connSync({ changeConn: false }),
    sender,
    mint,
    sender.publicKey
  );
  logger.debug("ATA address:", associatedAddr.toBase58());

  // mint tokens to the associated token account
  let mintTokensTx = await mintToChecked(
    cm.connSync({ changeConn: false }),
    sender,
    mint,
    associatedAddr,
    sender.publicKey,
    MAX_TOKENS,
    TOKEN_DECIMALS
  );
  logger.debug(`Minted ${MAX_TOKENS} tokens to ${associatedAddr.toBase58()}`);
  logger.debug(`Mint tx: ${mintTokensTx}`);

  logger.debug("Fetching balance of", associatedAddr.toBase58());
  let senderTokenBal = await cm
    .connSync({ changeConn: false })
    .getTokenAccountBalance(associatedAddr, COMMITMENT);
  logger.debug(`Sender balance: ${senderTokenBal.value.uiAmount} tokens`);

  // generate receivers
  logger.debug(`Generating ${NO_OF_RECEIVERS} receivers...`);
  const receivers: Keypair[] = [];
  for (let i = 0; i < NO_OF_RECEIVERS; i++) {
    receivers.push(Keypair.generate());
  }
  logger.debug("Receivers generated");

  // generate transactions
  const missingAccountIxs: TransactionInstruction[] = [];
  const transactions: Transaction[] = [];

  logger.debug("Fetching balance of", associatedAddr.toBase58());
  let senderBal = (
    await cm
      .connSync({ changeConn: true })
      .getTokenAccountBalance(associatedAddr, COMMITMENT)
  ).value.amount;
  logger.debug(`Sender balance: ${senderBal}`);
  const transferAmount = Math.floor(Number(senderBal) / NO_OF_RECEIVERS);

  logger.debug(`Sending ${transferAmount} to ${NO_OF_RECEIVERS} receivers`);
  for (let i = 0; i < NO_OF_RECEIVERS; i++) {
    const ata = await getAssociatedTokenAddress(mint, receivers[i].publicKey);
    const ix = createAssociatedTokenAccountInstruction(
      sender.publicKey,
      ata,
      receivers[i].publicKey,
      mint
    );
    missingAccountIxs.push(ix);
  }

  // generate transactions for create mint accounts
  // split into chunks of 12 ixs
  const missingAccountIxsChunks = chunk(missingAccountIxs, 12);
  for (let i = 0; i < missingAccountIxsChunks.length; i++) {
    const chunk = missingAccountIxsChunks[i];
    const tx = TransactionBuilder.create().addIx(chunk).build();
    transactions.push(tx);
  }

  // send transactions
  if (!SKIP_SENDING) {
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
      await sleep(DELAY_BETWEEN_CHUNKS_MS);
    }
  }

  if (!SKIP_BALANCE_CHECK) {
    // fetch balance of the generated address
    logger.debug("Fetching balance of:", sender.publicKey.toBase58());
    senderBal = (
      await cm
        .connSync({ changeConn: true })
        .getTokenAccountBalance(associatedAddr, COMMITMENT)
    ).value.amount;
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
      await sleep(DELAY_BETWEEN_CHUNKS_MS);
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
