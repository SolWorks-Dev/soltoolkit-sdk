import { Commitment } from "@solana/web3.js";
import { Logger, ConnectionManager } from "../package/build/index";

(async () => {
  const logger = new Logger("example");

  // create connection manager
  // only needs to be created once as it is a singleton
  const cm = await ConnectionManager.getInstance({
    // commitment will be set to 'processed' if not provided
    commitment: 'single',

    // provide an array of endpoints to connect to or use `endpoint` to connect to a single endpoint
    endpoints: [
      "https://api.mainnet-beta.solana.com",
      "https://api.devnet.solana.com",
    ],

    // mode will be set to 'latest' if not provided
    mode: 'latest-valid-block-height',

    // network must be provided, airdrop only supported on devnet
    network: 'mainnet-beta',

    // verbose will be set to false if not provided
    verbose: false
  });

  // get fastest endpoint
  const fastest = cm._fastestEndpoint;
  logger.debug(`Fastest endpoint: ${fastest}`);

  // get highest slot endpoint
  const highestSlot = cm._highestSlotEndpoint;
  logger.debug(`Highest slot endpoint: ${highestSlot}`);

  // get latest block height endpoint
  const latestBlockHeight = cm._latestValidBlockHeightEndpoint;
  logger.debug(`Latest block height endpoint: ${latestBlockHeight}`);

  // get current connection endpoint
  const current = cm.connSync({ changeConn: false }).rpcEndpoint;
  logger.debug(`Current endpoint: ${current}`);
})();
