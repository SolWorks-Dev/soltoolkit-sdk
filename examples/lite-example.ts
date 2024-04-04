import { ConnectionManager } from "../package/build/index";

(async () => {
  // create connection manager
  const cm = await ConnectionManager.getInstance({
    commitment: 'single',
    endpoints: [
      "https://api.mainnet-beta.solana.com",
      "https://rpc.helius.xyz/?api-key=53c6cb3b-bc8b-49de-982f-ffda117197c8",
      "https://racial-ibbie-fast-mainnet.helius-rpc.com",
      "https://rpc.hellomoon.io/39df595d-d5b3-422c-8883-fdeb9e3540f3",
      "https://global.rpc.hellomoon.io/39df595d-d5b3-422c-8883-fdeb9e3540f3",
    ],
    mode: 'fastest',
    network: 'mainnet-beta',
    verbose: false
  });

  // get connection
  const conn = cm.connSync({});
  console.log(`Current endpoint: ${conn.rpcEndpoint}`);
})();
