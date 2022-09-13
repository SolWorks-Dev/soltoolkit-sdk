import { Commitment } from "@solana/web3.js";
import { Logger, ConnectionManager } from "@solworks/soltoolkit-sdk";

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
    mode: "fastest",
    network: "devnet"
  });

  // get summary of endpoint speeds
  const summary = await cm.getEndpointsSummary();
  logger.debug(JSON.stringify(summary, null, 2));

  // get fastest endpoint
  const fastest = cm._fastestEndpoint;
  logger.debug(`Fastest endpoint: ${fastest}`);

  // get current connection endpoint
  const current = cm.conn({ changeConn: false }).rpcEndpoint;
  logger.debug(`Current endpoint: ${current}`);
})();
