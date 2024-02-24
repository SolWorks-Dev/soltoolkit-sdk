<div align="center">
  <h1 style="margin-top:20px;">SolToolkit</h1>
  <p>
    <a href="https://www.npmjs.com/package/@solworks/soltoolkit-sdk"><img alt="SDK npm package" src="https://img.shields.io/npm/v/@solworks/soltoolkit-sdk" /></a>
    <a href="https://docs.solworks.dev/"><img alt="Docs" src="https://img.shields.io/badge/docs-tutorials-blueviolet" /></a>
    <a href="https://discord.com/invite/Qbd7yNcEPS"><img alt="Discord Chat" src="https://img.shields.io/discord/991631315768193067?color=blueviolet" /></a>
  </p>
</div>

# SolToolkit
This repository provides open source access to SolToolkit (Typescript) SDK.

## Installation
```
npm i @solworks/soltoolkit-sdk
```

## Modules

### ConnectionManager
ConnectionManager is a singleton class that manages web3.js Connection(s). It takes the following parameters on initialization using the async `getInstance()` method:
```typescript
{
    network: Cluster;
    endpoint?: string;
    endpoints?: string[];
    config?: ConnectionConfig;
    commitment?: Commitment;
    mode?: Mode;
}
```
#### Parameters
- `network` is the cluster to connect to, possible values are 'mainnet-beta', 'testnet', 'devnet', 'localnet'. This is required. If you do not pass in any values for `endpoint` or `endpoints`, the default endpoints for the network will be used.
- `endpoint` is a single endpoint to connect to. This is optional.
- `endpoints` is an array of endpoints to connect to. This is optional.
- `config` is a web3.js ConnectionConfig object. This is optional.
- `commitment` is the commitment level to use for transactions. This is optional, will default to 'max'.
- `mode` is the Mode for the ConnectionManager. This is optional, will default to 'single'. Possible values are:
  - 'single' - Uses the `endpoint` param, that falls back to the first endpoint provided in `endpoints`, that falls back to the default endpoints for the network.
  - 'first' - Uses the first endpoint provided in `endpoints`. Throws an error if no endpoints are provided.
  - 'last' - Uses the last endpoint provided in `endpoints`. Throws an error if no endpoints are provided.
  - 'round-robin' - Uses the endpoints provided in `endpoints` in a round-robin fashion (cycles through each endpoint in sequence starting from the first). Throws an error if no endpoints are provided.
  - 'random' - Uses a random endpoint provided in `endpoints`. Throws an error if no endpoints are provided.
  - 'fastest' - Uses the fastest endpoint provided in `endpoints`. Throws an error if no endpoints are provided.
  - 'highest-slot' - Uses the endpoint with the highest slot provided in `endpoints`. Throws an error if no endpoints are provided.

#### Methods
- `getInstance()` - Returns the singleton instance of the ConnectionManager. This method is async and must be awaited.
- `getInstanceSync()` - Returns the singleton instance of the ConnectionManager. This method is synchronous. This method should only be used after initializing the ConnectionManager with `getInstance()`.
- `conn()` - Returns a web3.js connection. This method will update the summary for each RPC to determine the 'fastest' or 'highest slot' endpoint. This method is async and must be awaited. 
- `connSync()` - Returns a web3.js connection. This method will use fastest' or 'highest slot' endpoint determined during initialization. This method is synchronous.

## Examples
### Fetching the fastest RPC endpoint
```typescript
import { ConnectionManager } from "@solworks/soltoolkit-sdk";

(async () => {
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
  const fastestEndpoint = cm._fastestEndpoint;
  console.log(`Fastest endpoint: ${fastestEndpoint}`);
})();
```

### Fetching the highest slot RPC endpoint
```typescript
import { ConnectionManager, Logger } from "@solworks/soltoolkit-sdk";

(async () => {
  // create connection manager
  const cm = await ConnectionManager.getInstance({
    commitment: "max",
    endpoints: [
      "https://api.devnet.solana.com",
      "https://solana-devnet-rpc.allthatnode.com",
      "https://mango.devnet.rpcpool.com",
      "https://rpc.ankr.com/solana_devnet",
    ],
    mode: "highest-slot",
    network: "devnet"
  });

  // get highest slot endpoint
  const highestSlotEndpoint = cm._highestSlotEndpoint;
  console.log(`Highest slot endpoint: ${_highestSlotEndpoint}`);
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
    .connSync({ airdrop: true })
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
    .connSync({ airdrop: true })
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