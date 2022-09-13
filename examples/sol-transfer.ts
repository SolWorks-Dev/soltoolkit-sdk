import { Logger } from "../package/src/modules/Logger";
import { Commitment, Keypair, LAMPORTS_PER_SOL, Signer } from "@solana/web3.js";
import {
  ConnectionManager,
  TransactionBuilder,
  TransactionWrapper,
} from "../package/src/index";

const COMMITMENT: Commitment = "confirmed";

// generate keypair for example
const sender = Keypair.generate();
const receiver = Keypair.generate();

(async () => {
  const logger = new Logger("example");

  // create connection manager
  const cm = await ConnectionManager.getInstance({
    commitment: COMMITMENT,
    endpoints: [
      "https://api.devnet.solana.com",
      "https://solana-devnet-rpc.allthatnode.com",
      "https://mango.devnet.rpcpool.com",
      "https://rpc.ankr.com/solana_devnet",
    ],
    mode: "fastest",
    network: "devnet",
  });

  // airdrop sol to the generated address
  logger.debug("Airdropping 1 SOL to:", sender.publicKey.toBase58());
  const airdropSig = await cm
    .conn({ airdrop: true })
    .requestAirdrop(sender.publicKey, LAMPORTS_PER_SOL);

  // confirm airdrop tx
  logger.debug(`Confirming transaction ${airdropSig}`);
  await TransactionWrapper.confirmTx({
    connectionManager: cm,
    changeConn: false,
    signature: airdropSig,
    commitment: "max",
  });
  logger.debug("Airdrop transaction confirmed");

  // fetch balance of the generated address
  logger.debug("Fetching balance of:", sender.publicKey.toBase58());
  let senderBal = await cm.conn({}).getBalance(sender.publicKey, COMMITMENT);
  logger.debug(`Sender balance: ${senderBal}`);

  logger.debug("Fetching balance of:", receiver.publicKey.toBase58());
  let receiverBal = await cm
    .conn({})
    .getBalance(receiver.publicKey, COMMITMENT);
  logger.debug(`Receiver balance: ${receiverBal}`);

  // create builder and add token transfer ix
  logger.debug("Creating transaction");
  var builder = TransactionBuilder
    .create()
    .addSolTransferIx({
      from: sender.publicKey,
      to: receiver.publicKey,
      amountLamports: 10_000_000,
    })
    .addMemoIx({
      memo: "gm",
      signer: sender.publicKey,
    })
    .addComputeBudgetIx({
      units: 1_000_000,
    });

  // build the transaction
  // returns a transaction with no fee payer or blockhash
  let tx = builder.build();

  // feed transaction into TransactionWrapper
  const wrapper = await TransactionWrapper.create({
    connectionManager: cm,
    transaction: tx,
    signer: sender.publicKey,
  }).addBlockhashAndFeePayer();

  // sign the transaction
  const signedTx = await wrapper.sign({
    signer: sender as Signer,
  });

  // send and confirm the transaction
  const transferSig = await wrapper.sendAndConfirm({
    serialisedTx: signedTx.serialize(),
    commitment: COMMITMENT,
  });
  logger.debug("Transaction sent:", transferSig.toString());

  // fetch balance of the generated address
  logger.debug("Fetching balance of:", sender.publicKey.toBase58());
  senderBal = await cm.conn({}).getBalance(sender.publicKey, COMMITMENT);
  logger.debug(`Sender balance: ${senderBal}`);

  logger.debug("Fetching balance of:", receiver.publicKey.toBase58());
  receiverBal = await cm.conn({}).getBalance(receiver.publicKey, COMMITMENT);
  logger.debug(`Receiver balance: ${receiverBal}`);
})();
