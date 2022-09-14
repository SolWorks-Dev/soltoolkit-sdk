import { Commitment } from "@solana/web3.js";
import { Logger, ConnectionManager } from "../package/build/index";


(async () => {
  const COMMITMENT: Commitment = "max";
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
    mode: "highest-slot",
    network: "devnet"
  });

  // get summary of endpoint speeds
  const summary = await cm.getEndpointsSummary();
  logger.debug(JSON.stringify(summary, null, 2));

  // get fastest endpoint
  const fastest = cm._fastestEndpoint;
  logger.debug(`Fastest endpoint: ${fastest}`);

  // get highest slot endpoint
  const highestSlot = cm._highestSlotEndpoint;
  logger.debug(`Highest slot endpoint: ${highestSlot}`);

  // get current connection endpoint
  const current = cm.connSync({ changeConn: false }).rpcEndpoint;
  logger.debug(`Current endpoint: ${current}`);
})();
