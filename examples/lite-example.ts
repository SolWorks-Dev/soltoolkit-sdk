import { ConnectionManager } from "../package/build/index";

(async () => {
  // create connection manager
  const cm = await ConnectionManager.getInstance({
    commitment: 'single',
    endpoints: [
      "https://api.mainnet-beta.solana.com",
      "https://api.devnet.solana.com",
      "https://api.testnet.solana.com",
    ],
    mode: 'fastest',
    network: 'mainnet-beta',
    verbose: true
  });
})();
