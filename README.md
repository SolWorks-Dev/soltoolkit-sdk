<div align="center">
  <h1 style="margin-top:20px;">SolToolkit v0.0.1</h1>
  <p>
    <a href="https://www.npmjs.com/package/@solworks/soltoolkit-sdk"><img alt="SDK npm package" src="https://img.shields.io/npm/v/@solworks/soltoolkit-sdk" /></a>
    <a href="https://help.solworks.dev/"><img alt="Docs" src="https://img.shields.io/badge/docs-tutorials-blueviolet" /></a>
    <a href="https://discord.com/invite/qfEGBPRyUt"><img alt="Discord Chat" src="https://img.shields.io/discord/991631315768193067?color=blueviolet" /></a>
  </p>
</div>

# SolToolkit v0.0.1
This repository provides open source access to SolToolkit (Typescript) SDK.

## Installation
```
npm i @solworks/soltoolkit-sdk
```

## Examples
### Fetching the fastest RPC endpoint
```typescript
import { ConnectionManager, Logger } from "@solworks/soltoolkit-sdk";

(async () => {
  const logger = new Logger("example");

  // create connection manager
  const cm = await ConnectionManager.getInstance({
    commitment: "max",
    endpoints: [
      "https://api.devnet.solana.com",
      "https://solana-devnet-rpc.allthatnode.com",
      "https://mango.devnet.rpcpool.com",
      "https://rpc.ankr.com/solana_devnet",
    ],
    mode: "fastest",
    network: "devnet"
  });

  // get fastest endpoint
  const fastest = cm._fastestEndpoint;
  logger.debug(`Fastest endpoint: ${fastest}`);
})();
```

### Fetching a summary of RPC speeds
```typescript
import { ConnectionManager, Logger } from "@solworks/soltoolkit-sdk";

(async () => {
  const logger = new Logger("example");

  // create connection manager
  const cm = await ConnectionManager.getInstance({
    commitment: "max",
    endpoints: [
      "https://api.devnet.solana.com",
      "https://solana-devnet-rpc.allthatnode.com",
      "https://mango.devnet.rpcpool.com",
      "https://rpc.ankr.com/solana_devnet",
    ],
    mode: "fastest",
    network: "devnet"
  });

  // get summary of endpoint speeds
  const summary = await cm.getEndpointsSummary();
  logger.debug(JSON.stringify(summary, null, 2));
})();
```

### Transfer SOL to 1 user
```typescript
import { Keypair, LAMPORTS_PER_SOL, Signer } from "@solana/web3.js";
import {
  ConnectionManager,
  TransactionBuilder,
  TransactionWrapper,
  Logger
} from "@solworks/soltoolkit-sdk";

const logger = new Logger("example");
const sender = Keypair.generate();
const receiver = Keypair.generate();

(async () => {
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
  const airdropSig = await cm
    .conn({ airdrop: true })
    .requestAirdrop(sender.publicKey, LAMPORTS_PER_SOL);

  // confirm airdrop tx
  await TransactionWrapper.confirmTx({
    connectionManager: cm,
    changeConn: false,
    signature: airdropSig,
    commitment: "max",
  });

  // create builder and add token transfer ix
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
  });
})();
```

### Send a memo to 1 user
```typescript
import { Keypair, LAMPORTS_PER_SOL, Signer } from "@solana/web3.js";
import {
  ConnectionManager,
  TransactionBuilder,
  TransactionWrapper,
  Logger
} from "@solworks/soltoolkit-sdk";

const logger = new Logger("example");
const sender = Keypair.generate();
const receiver = Keypair.generate();

(async () => {
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
  const airdropSig = await cm
    .conn({ airdrop: true })
    .requestAirdrop(sender.publicKey, LAMPORTS_PER_SOL);

  // confirm airdrop tx
  await TransactionWrapper.confirmTx({
    connectionManager: cm,
    changeConn: false,
    signature: airdropSig,
    commitment: "max",
  });

  // create builder and add token transfer ix
  var builder = TransactionBuilder
    .create()
    .addMemoIx({
      memo: "gm",
      signer: sender.publicKey,
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
  });
```

### Dispersing SOL to 10,000 users in <120 seconds
See [example](https://github.com/SolWorks-Dev/soltoolkit-sdk/blob/master/examples/bulk-sol-transfer.ts).


## License
SolToolkit is licensed under [Affero GPL](https://www.gnu.org/licenses/agpl-3.0.txt).