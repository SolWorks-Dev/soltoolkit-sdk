import {
  Commitment,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Signer,
} from "@solana/web3.js";
import {
  ConnectionManager,
  TransactionWrapper,
  Logger,
  TransactionBuilder,
} from "@solworks/soltoolkit-sdk";
import {
  getAssociatedTokenAddress,
  createTransferCheckedInstruction,
  createAssociatedTokenAccountInstruction
} from "@solana/spl-token";
import { Metaplex } from "@metaplex-foundation/js";
import * as fs from "fs";

// This script will:
// 1. Iterate through a list of mint addresses
// 2. Create an associated token account for each mint address
// 3. Transfer 1 NFT to each associated token account
// 4. Confirm the transaction
// 5. Log the transaction hash and result along with any errors
const rpcEndpoint = 'https://api.mainnet-beta.solana.com';
const commitment: Commitment = "max";
const skipSending = false;
const sender = Keypair.fromSecretKey(Uint8Array.from([...]));
const minters = [{
  "address": "...",
  "items": 3
}, {
  "address": "...",
  "items": 3
}, {
  "address": "...",
  "items": 12
}];

(async () => {
  const logger = new Logger("nft-transfer");
  const cm = await ConnectionManager.getInstance({
    commitment,
    endpoint: rpcEndpoint,
    mode: "single",
    network: "mainnet-beta",
  });
  const mp = new Metaplex(cm._connection);

  // get SOL balance of sender
  logger.debug("Fetching SOL balance of", sender.publicKey.toBase58());
  let senderSOLBal = await cm
    .connSync({ changeConn: false })
    .getBalance(sender.publicKey, commitment);
  logger.debug(`Sender balance: ${senderSOLBal / LAMPORTS_PER_SOL} SOL`);

  
  let results: IResults = {
    success: [],
    failure: [],
  };
  // iterate through mints
  for (let i = 0; i < minters.length; i++) {
    // get NFTs owned by sender
    const nftsOwnedBySender = await mp
      .nfts()
      .findAllByOwner({ owner: sender.publicKey });
    logger.debug("NFTs owned by sender:", nftsOwnedBySender.length);
    const receivingOwner = new PublicKey(minters[i].address);
    const nftsToSend = minters[i].items;

    // find minted nfts to send
    for (let k = 0; k < nftsToSend; k++) {
      if (nftsOwnedBySender.length === 0) {
        logger.debug("No more NFTs to send");
        break;
      }

      const nftToSend = nftsOwnedBySender[k];
      logger.debug("NFT to send:", nftToSend);
      const sendingMint = (nftToSend as any).mintAddress;
      logger.debug("Sending mint:", sendingMint.toBase58());

      try {    
        let sendingAta = await getAssociatedTokenAddress(sendingMint, sender.publicKey);
        logger.debug("Sending ATA:", sendingAta.toBase58());
        
        let receivingAta = await getAssociatedTokenAddress(sendingMint, receivingOwner);
        logger.debug("Receiving ATA:", receivingAta.toBase58());
        
        // generate tx to transfer NFT to ATA
        // create associated token account
        const tx = TransactionBuilder
          .create()
          .addIx([
              createAssociatedTokenAccountInstruction(
                sender.publicKey,
                receivingAta,
                receivingOwner,
                sendingMint
              ),
              createTransferCheckedInstruction(
                sendingAta,
                sendingMint,
                receivingAta,
                sender.publicKey,
                1,
                0
              )
            ])
          .build();
    
    
        if (!skipSending) {
          // feed transaction into TransactionWrapper
          const wrapper = await TransactionWrapper
            .create({
              connectionManager: cm,
              transaction: tx,
              signer: sender.publicKey,
            })
            .addBlockhashAndFeePayer(sender.publicKey);
      
          // sign the transaction
          logger.debug(`Signing transaction ${i + 1}`);
          const signedTx = await wrapper.sign({ signer: sender as Signer });
      
          // send and confirm the transaction
          logger.debug(`Sending transaction ${i + 1}`);
          const transferSig = await wrapper.sendAndConfirm({ 
            serialisedTx: signedTx.serialize(), 
            commitment 
          });
          logger.debug("Transaction sent:", transferSig.toString());
    
          results.success.push({
            sentTicketMint: sendingMint.toBase58(),
            ticketHeldMint: receivingOwner,
          });

          await sleep(3_000);
        }
      } catch (e: any) {
        logger.error(e);
        results.failure.push({
          sentTicketMint: sendingMint.toBase58(),
          ticketHeldMint: receivingOwner.toBase58()
        });
      }
    }
  }
    

  fs.writeFileSync("results.json", JSON.stringify(results));
})();

interface IResults {
  success: Array<any>;
  failure: Array<any>;
}
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}