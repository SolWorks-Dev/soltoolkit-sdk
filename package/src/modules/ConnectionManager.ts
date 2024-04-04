import { Cluster, Commitment, Connection, ConnectionConfig } from '@solana/web3.js';
import { ILogger } from '../interfaces/ILogger';
import { Logger } from './Logger';

/**
 * Manager for one or more web3.js connection(s).
 *
 * @remarks
 * This class is a singleton. Use the `getInstance()` method to get the instance.
 *
 * @beta
 *
 * @example
 * ```typescript
 * import { ConnectionManager } from "@solworks/soltoolkit-sdk";
 *
 * (async () => {
 *  const cm = await ConnectionManager.getInstance({
 *      commitment: COMMITMENT,
 *      endpoints: [
 *          "https://mango.devnet.rpcpool.com",
 *          "https://api.devnet.solana.com",
 *          "https://devnet.genesysgo.net",
 *      ],
 *      mode: "round-robin",
 *      network: "devnet",
 *  });
 * })
 * ```
 */
export class ConnectionManager {
    private static _instance: ConnectionManager;
    public _connection: Connection;
    public _fastestEndpoint: string;
    public _highestSlotEndpoint: string;
    public _latestValidBlockHeightEndpoint: string;
    private _config: IConnectionManagerConstructor;
    private _logger: ILogger = new Logger('@soltoolkit/ConnectionManager');
    private _rpcSummary: IRPCSummary[] = [];

    private constructor(
        {
            network = 'mainnet-beta',
            endpoint,
            config,
            commitment = 'processed',
            endpoints,
            mode = 'single',
            rpcSummary: endpointsSortedBySpeed,
            verbose = false,
            transactionTimeout = 120_000
        }: IConnectionManagerConstructor,
    ) {
        let rpcUrl: string | undefined;

        if (verbose)
            this._logger.debug(
                `Initializing ConnectionManager with params: ${JSON.stringify(
                    {
                        network,
                        endpoint,
                        config,
                        commitment,
                        endpoints,
                        mode,
                        endpointsSortedBySpeed
                    },
                    null,
                    2
                )}`
            );

        // filter out unreachable endpoints
        const reachableEndpoints = endpointsSortedBySpeed.filter((endpoint) => endpoint.isReachable === true);

        // filter by speed, ascending (lowest first)
        const fastestEndpoint = reachableEndpoints.sort((a, b) => a.speedMs! - b.speedMs!)[0].endpoint;

        // filter by slot height, descending (highest first)
        const highestSlotEndpoint = reachableEndpoints.sort((a, b) => b.currentSlot! - a.currentSlot!)[0].endpoint;
        
        // filter by last valid block height, descending (highest first)
        const latestValidBlockHeightEndpoint = reachableEndpoints.sort((a, b) => b.lastValidBlockHeight! - a.lastValidBlockHeight!)[0].endpoint;

        // set rpc url based on mode and network
        switch (mode) {
            // priority for endpoint over endpoints array
            // fallback to endpoints array if endpoint is not provided
            // fallback to default endpoint if no endpoint or endpoints provided
            case 'single':
                {
                    if (endpoint) {
                        rpcUrl = endpoint;
                    } else if (endpoints && endpoints.length > 0) {
                        rpcUrl = endpoints[0];
                    } else {
                        rpcUrl = ConnectionManager.getDefaultEndpoint(network);
                    }
                }
                break;
            // uses endpoints array only, first item selected
            // no fallback support if endpoints array is not provided
            case 'first':
                {
                    if (endpoints && endpoints.length > 0) {
                        rpcUrl = endpoints[0];
                    } else {
                        throw new Error('No endpoints provided with mode "first"');
                    }
                }
                break;
            // uses endpoints array only, last item selected
            // no fallback support if endpoints array is not provided
            case 'last':
                {
                    if (endpoints && endpoints.length > 0) {
                        rpcUrl = endpoints[-1];
                    } else {
                        throw new Error('No endpoints provided with mode "last"');
                    }
                }
                break;
            // uses endpoints array only, alternates between endpoints
            // starts with first item in array
            // no fallback support if endpoints array is not provided
            case 'round-robin':
                {
                    if (endpoints && endpoints.length > 0) {
                        rpcUrl = endpoints[0];
                    } else {
                        throw new Error('No endpoints provided with mode "round-robin"');
                    }
                }
                break;
            // uses the fastest endpoint determined in the static initialization
            // no fallback support
            case 'fastest': {
                if (fastestEndpoint) {
                    rpcUrl = fastestEndpoint;
                } else {
                    throw new Error('No fastest endpoint provided with mode "fastest"');
                }
                break;
            }
            // uses the highest slot endpoint determined in the static initialization
            // no fallback support
            case 'highest-slot':
                {
                    if (highestSlotEndpoint) {
                        rpcUrl = highestSlotEndpoint;
                    } else {
                        throw new Error('No highest slot endpoint provided with mode "highest-slot"');
                    }
                }
                break;
            // uses the endpoint with the latest valid block height
            // no fallback support
            case 'latest-valid-block-height':
                {
                    if (latestValidBlockHeightEndpoint) {
                        rpcUrl = latestValidBlockHeightEndpoint;
                    } else {
                        throw new Error('No latest valid block height endpoint provided with mode "latest-valid-block-height"');
                    }
                }
                break;
            // uses endpoints array only, selects random item from array
            // no fallback support if endpoints array is not provided
            case 'random':
                {
                    if (endpoints && endpoints.length > 0) {
                        rpcUrl = endpoints[Math.floor(Math.random() * endpoints.length)];
                    } else {
                        throw new Error('No endpoints provided with mode "random"');
                    }
                }
                break;
            default:
                throw new Error('Invalid mode');
        }

        if (rpcUrl === undefined) {
            throw new Error('No endpoint has been set');
        }

        if (verbose) this._logger.debug(`Using endpoint: ${rpcUrl}`);

        this._connection = new Connection(rpcUrl, {
            ...config,
            commitment,
            confirmTransactionInitialTimeout: 120_000
        });
        this._config = {
            network,
            endpoint,
            config,
            commitment,
            endpoints,
            mode,
            rpcSummary: endpointsSortedBySpeed,
            verbose,
            transactionTimeout
        };
        this._fastestEndpoint = fastestEndpoint || rpcUrl;
        this._highestSlotEndpoint = highestSlotEndpoint || rpcUrl;
        this._latestValidBlockHeightEndpoint = latestValidBlockHeightEndpoint || rpcUrl;
        this._rpcSummary = endpointsSortedBySpeed;
    }

    /**
     * Builds and returns a singleton instance of the ConnectionManager class. This method runs a speed test on the provided endpoint/s on initialization.
     * @param {Cluster} values.network - The network to connect to.
     * @param {string=} values.endpoint - If using `mode` "single", will default to this endpoint. If not provided, will default to the default public RPC endpoint for the network.
     * @param {string[]=} values.endpoints - If any other mode, will default to this array of endpoints. If not provided, will default to `values.endpoint` or the default public RPC endpoint for the network.
     * @param {ConnectionConfig=} values.config - Additional configuration options for the web3.js connection.
     * @param {Commitment=} values.commitment - The commitment level. Defaults to "processed".
     * @param {Mode=} values.mode - The mode to use for selecting an endpoint.
     * @returns {ConnectionManager} A singleton instance of the ConnectionManager class.
     */
    public static async getInstance(values: Omit<IConnectionManagerConstructor, 'rpcSummary'>): Promise<ConnectionManager> {
        if (!ConnectionManager._instance) {
            const endpoints = values.endpoints
                ? values.endpoints
                : values.endpoint !== undefined
                ? [values.endpoint]
                : [this.getDefaultEndpoint(values.network)];
            const endpointsSummary = await ConnectionManager.getEndpointsSummary(
                endpoints,
                values.commitment || 'processed'
            );

            // if no endpoints are available, throw error
            if (endpointsSummary.every((endpoint) => endpoint.isReachable === false)) {
                throw new Error('No reachable endpoints');
            }

            // check if any endpoints are available
            const endpointsSortedBySpeed = endpointsSummary
                .filter((endpoint) => endpoint.isReachable === true)    
                .sort((a, b) => a.speedMs! - b.speedMs!);
            ConnectionManager._instance = new ConnectionManager({
                ...values,
                rpcSummary: endpointsSortedBySpeed
            });
        }

        return ConnectionManager._instance;
    }

    /**
     * Builds and returns a singleton instance of the ConnectionManager class. This method should only be used after initializing the ConnectionManager with `getInstance()`.
     * @returns {Connection} The web3.js connection.
     */
    public static getInstanceSync(): ConnectionManager {
        if (!ConnectionManager._instance) {
            throw new Error('ConnectionManager has not been initialized');
        }

        return ConnectionManager._instance;
    }

    /**
     * Returns a web3.js connection.
     *
     * @remarks
     * If you are using `mode` "fastest" or "highest-slot", this method will return the RPC determined during initialization of ConnectionManager. Use the async `conn()` method instead to update the determined RPC.
     *
     * @param changeConn - If true, will return a new connection based on the configured `mode`. If false, will return the current connection.
     * @param airdrop - If true, will default to the public RPC endpoint hosted by Solana (it is the only RPC endpoint that supports airdrops).
     * @returns A web3.js connection.
     */
    public connSync({ changeConn = true, airdrop = false }: { changeConn?: boolean; airdrop?: boolean }): Connection {
        if (!changeConn) {
            return this._connection;
        }

        let conn: Connection = this._connection;

        if (airdrop) {
            conn = new Connection(
                ConnectionManager.getDefaultEndpoint(this._config.network),
                this._config.config || this._config.commitment
            );
        } else {
            switch (this._config.mode) {
                case 'single':
                case 'first':
                case 'last':
                    {
                        // handled in constructor, no need to reinitialize
                        // use async method to get new connection for `fastest` or `hightest-slot` mode
                        conn = this._connection;
                    }
                    break;
                case 'highest-slot':
                    {
                        if (this._connection.rpcEndpoint !== this._highestSlotEndpoint) {
                            if (this._config.verbose) this._logger.debug(`Changing endpoint to ${this._highestSlotEndpoint}`);
                            conn = new Connection(
                                this._highestSlotEndpoint,
                                this._config.config || this._config.commitment
                            );
                        }
                    }
                    break;
                case 'fastest': {
                    {
                        if (this._connection.rpcEndpoint !== this._fastestEndpoint) {
                            if (this._config.verbose) this._logger.debug(`Changing connection to ${this._fastestEndpoint}`);
                            conn = new Connection(
                                this._fastestEndpoint,
                                this._config.config || this._config.commitment
                            );
                        }
                    }
                    break;
                }
                case 'round-robin':
                    {
                        const currentIndex = this._config.endpoints?.indexOf(this._connection.rpcEndpoint);
                        if (currentIndex === -1) {
                            if (
                                this._connection.rpcEndpoint ===
                                ConnectionManager.getDefaultEndpoint(this._config.network)
                            ) {
                                conn = new Connection(
                                    this._config.endpoints![0],
                                    this._config.config || this._config.commitment
                                );
                            } else {
                                throw new Error('Current endpoint not found in endpoints array');
                            }
                        } else if (currentIndex !== undefined) {
                            // we can assume endpoints is non-null at this point
                            // constructor will throw if endpoints is null + mode is round-robin
                            const nextIndex = currentIndex + 1 >= this._config.endpoints!.length ? 0 : currentIndex + 1;
                            const rpcUrl = this._config.endpoints![nextIndex];
                            conn = new Connection(rpcUrl, this._config.config || this._config.commitment);
                        } else {
                            throw new Error('Current index is undefined');
                        }
                    }
                    break;
                case 'latest-valid-block-height':
                {
                    if (this._connection.rpcEndpoint !== this._latestValidBlockHeightEndpoint) {
                        if (this._config.verbose) this._logger.debug(`Changing connection to ${this._latestValidBlockHeightEndpoint}`);
                        conn = new Connection(
                            this._latestValidBlockHeightEndpoint,
                            this._config.config || this._config.commitment
                        );
                    }
                }
                break;
                case 'random':
                    {
                        const rpcUrl =
                            this._config.endpoints![Math.floor(Math.random() * this._config.endpoints!.length)];
                        conn = new Connection(rpcUrl, this._config.config || this._config.commitment);
                    }
                    break;
                default:
                    if (this._config.verbose) this._logger.error('Invalid mode');
                    conn = this._connection;
                    break;
            }
        }

        if (this._config.verbose) this._logger.debug(`Using endpoint: ${conn.rpcEndpoint}`);
        this._connection = conn;
        return conn;
    }

    /**
     * Returns a web3.js connection.
     *
     * @param changeConn - If true, will return a new connection based on the configured `mode`. If false, will return the current connection.
     * @param airdrop - If true, will default to the public RPC endpoint hosted by Solana (it is the only RPC endpoint that supports airdrops).
     * @returns A web3.js connection.
     */
    public async conn({
        changeConn = true,
        airdrop = false
    }: {
        changeConn?: boolean;
        airdrop?: boolean;
    }): Promise<Connection> {
        if (!changeConn) {
            return this._connection;
        }

        let conn: Connection = this._connection;

        if (airdrop) {
            conn = new Connection(
                ConnectionManager.getDefaultEndpoint(this._config.network),
                this._config.config || this._config.commitment
            );
        } else {
            switch (this._config.mode) {
                case 'single':
                case 'first':
                case 'last':
                    // handled in constructor, no need to reinitialize
                    conn = this._connection;
                    break;
                case 'highest-slot':
                    {
                        const endpointsSummary = await this.getEndpointsSummary();

                        // throw error if all endpoints are unreachable
                        if (endpointsSummary.every((endpoint) => endpoint.isReachable === false)) {
                            throw new Error('All endpoints unreachable');
                        }

                        // filter out unreachable endpoints
                        let reachableEndpoints = endpointsSummary
                            .filter((endpoint) => endpoint.isReachable === true)
                            .sort((a, b) => a.currentSlot! - b.currentSlot!);

                        const highestSlotEndpoint = reachableEndpoints[0].endpoint;
                        if (this._connection.rpcEndpoint !== highestSlotEndpoint) {
                            if (this._config.verbose) this._logger.debug(`Changing endpoint to ${highestSlotEndpoint}`);
                            conn = new Connection(highestSlotEndpoint, this._config.config || this._config.commitment);
                        }
                    }
                    break;
                case 'fastest': {
                    {
                        const endpointsSummary = await this.getEndpointsSummary();

                        // throw error if all endpoints are unreachable
                        if (endpointsSummary.every((endpoint) => endpoint.isReachable === false)) {
                            throw new Error('All endpoints unreachable');
                        }

                        // filter out unreachable endpoints
                        let reachableEndpoints = endpointsSummary
                            .filter((endpoint) => endpoint.isReachable === true)
                            .sort((a, b) => a.speedMs! - b.speedMs!);

                        const fastestEndpoint = reachableEndpoints[0].endpoint;
                        if (this._connection.rpcEndpoint !== fastestEndpoint) {
                            if (this._config.verbose) this._logger.debug(`Changing connection to ${fastestEndpoint}`);
                            conn = new Connection(fastestEndpoint, this._config.config || this._config.commitment);
                        }
                    }
                    break;
                }
                case 'round-robin':
                    {
                        const currentIndex = this._config.endpoints?.indexOf(this._connection.rpcEndpoint);
                        if (currentIndex === -1) {
                            if (
                                this._connection.rpcEndpoint ===
                                ConnectionManager.getDefaultEndpoint(this._config.network)
                            ) {
                                conn = new Connection(
                                    this._config.endpoints![0],
                                    this._config.config || this._config.commitment
                                );
                            } else {
                                throw new Error('Current endpoint not found in endpoints array');
                            }
                        } else if (currentIndex !== undefined) {
                            // we can assume endpoints is non-null at this point
                            // constructor will throw if endpoints is null + mode is round-robin
                            const nextIndex = currentIndex + 1 >= this._config.endpoints!.length ? 0 : currentIndex + 1;
                            const rpcUrl = this._config.endpoints![nextIndex];
                            conn = new Connection(rpcUrl, this._config.config || this._config.commitment);
                        } else {
                            throw new Error('Current index is undefined');
                        }
                    }
                    break;
                case 'random':
                    const rpcUrl = this._config.endpoints![Math.floor(Math.random() * this._config.endpoints!.length)];
                    conn = new Connection(rpcUrl, this._config.config || this._config.commitment);
                    break;
                case 'latest-valid-block-height':
                    {
                        // get endpoint summary
                        const endpointsSummary = await this.getEndpointsSummary();
                        // throw error if all endpoints are unreachable
                        if (endpointsSummary.every((endpoint) => endpoint.isReachable === false)) {
                            throw new Error('All endpoints unreachable');
                        }
                        // filter unreachable endpoints and sort by last valid block height
                        let reachableEndpoints = endpointsSummary
                            .filter((endpoint) => endpoint.isReachable === true)
                            .sort((a, b) => b.lastValidBlockHeight! - a.lastValidBlockHeight!);
                        const latestValidBlockHeightEndpoint = reachableEndpoints[0].endpoint;
                        if (this._connection.rpcEndpoint !== latestValidBlockHeightEndpoint) {
                            if (this._config.verbose) this._logger.debug(`Changing connection to ${latestValidBlockHeightEndpoint}`);
                            conn = new Connection(
                                latestValidBlockHeightEndpoint,
                                this._config.config || this._config.commitment
                            );
                        }
                    }
                default:
                    if (this._config.verbose) this._logger.error('Invalid mode');
                    conn = this._connection;
                    break;
            }
        }

        if (this._config.verbose) this._logger.debug(`Using endpoint: ${conn.rpcEndpoint}`);
        this._connection = conn;
        return conn;
    }

    /**
     * Returns a summary of speed and slot height for each endpoint.
     * @returns {Promise<IRPCSummary[]>} An array of IRPCSummary objects.
     */
    public async getEndpointsSummary(): Promise<IRPCSummary[]> {
        const endpoints = this._config.endpoints || [this._connection.rpcEndpoint];
        const summary = await ConnectionManager.getEndpointsSummary(endpoints);
        this._rpcSummary = summary;
        return summary;
    }

    public getRpcSummary(): IRPCSummary[] {
        return this._rpcSummary;
    }

    /**
     * A static version of `getEndpointsSummary()`. Returns a summary of speed and slot height for each endpoint.
     * @param endpoints - An array of endpoints to test.
     * @param commitment - The commitment level.
     * @returns {Promise<IRPCSummary[]>} An array of IRPCSummary objects.
     */
    public static async getEndpointsSummary(endpoints: string[], commitment?: Commitment): Promise<IRPCSummary[]> {
        // handle if endpoints is empty
        if (endpoints.length === 0) {
            throw new Error('Endpoints array is empty');
        }

        // no handling if endpoint is unavailable
        const results = await Promise.all(
            endpoints.map(async (endpoint) => {
                try {
                    const conn = new Connection(endpoint);
                    const start = Date.now();
                    const { context, value } = await conn.getLatestBlockhashAndContext(commitment);
                    const end = Date.now();
                    const speedMs = end - start;
                    return {
                        endpoint,
                        speedMs,
                        currentSlot: context.slot,
                        isReachable: true,
                        lastValidBlockHeight: value.lastValidBlockHeight
                    } as IRPCSummary;
                } catch {
                    return {
                        endpoint,
                        speedMs: undefined,
                        currentSlot: undefined,
                        isReachable: false,
                        lastValidBlockHeight: undefined
                    } as IRPCSummary;
                }
            })
        );

        return results;
    }

    /**
     * Returns the fastest endpoint url, speed and slot height.
     * @param endpoints - An array of endpoints to test.
     * @param commitment - The commitment level.
     * @returns {Promise<IRPCSummary>} An IRPCSummary object.
     */
    public static async getFastestEndpoint(endpoints: string[], commitment?: Commitment): Promise<IRPCSummary> {
        let summary = await ConnectionManager.getEndpointsSummary(endpoints, commitment);

        // if all endpoints are unreachable, throw error
        if (summary.every((endpoint) => endpoint.isReachable === false)) {
            throw new Error('No reachable endpoints');
        }

        // filter out unreachable endpoints
        let reachableEndpoints = summary
            .filter((endpoint) => endpoint.isReachable === true)
            .sort((a, b) => a.speedMs! - b.speedMs!);

        return reachableEndpoints[0];
    }

    /**
     * Returns the default endpoint for the given network.
     * @param network - The network to get the default endpoint for.
     * @returns {string} The default endpoint.
     */
    public static getDefaultEndpoint(network: string | undefined): string {
        switch (network) {
            case 'mainnet-beta':
                return 'https://api.mainnet-beta.solana.com';
            case 'testnet':
                return 'https://api.testnet.solana.com';
            case 'devnet':
                return 'https://api.devnet.solana.com';
            case 'localnet':
                return 'http://localhost:8899';
            default:
                throw new Error(`Invalid network: ${network}`);
        }
    }
}

/**
 * The constructor for the ConnectionManager class.
 * @param {Cluster} values.network - The network to connect to.
 * @param {string=} values.endpoint - If using `mode` "single", will default to this endpoint. If not provided, will default to the default public RPC endpoint for the network.
 * @param {string[]=} values.endpoints - If any other mode, will default to this array of endpoints. If not provided, will default to `values.endpoint` or the default public RPC endpoint for the network.
 * @param {ConnectionConfig=} values.config - Additional configuration options for the web3.js connection.
 * @param {Commitment=} values.commitment - The commitment level. Defaults to "processed".
 * @param {Mode=} values.mode - The mode to use for selecting an endpoint. 
 * @param {IRPCSummary[]} values.rpcSummary - An array of IRPCSummary objects.
 * @param {boolean=} values.verbose - Whether to log initialization details.
 * @param {number=} values.transactionTimeout - The transaction timeout in milliseconds.
 */
export interface IConnectionManagerConstructor {
    network: Cluster;
    endpoint?: string;
    endpoints?: string[];
    config?: ConnectionConfig;
    commitment?: Commitment;
    mode?: Mode;
    rpcSummary: IRPCSummary[];
    verbose?: boolean;
    transactionTimeout?: number;
}

/**
 * An object representing a summary of speed and slot height for an endpoint.
 * @param {string} endpoint - The endpoint url.
 * @param {boolean} isReachable - Whether the endpoint is reachable.
 * @param {number=} speedMs - The speed of the endpoint in milliseconds.
 * @param {number=} currentSlot - The current slot height of the endpoint.
 * @param {string=} lastValidBlockHeight - The last valid block height of the endpoint.
 */
export interface IRPCSummary {
    endpoint: string;
    isReachable: boolean;
    speedMs?: number;
    currentSlot?: number;
    lastValidBlockHeight?: number;
}

/**
 * The mode to use for selecting an endpoint.
 * @param {string} single - Priority for endpoint over endpoints array. Fallback to endpoints array if endpoint is not provided. Fallback to default endpoint if no endpoint or endpoints provided.
 * @param {string} first - Uses endpoints array only, first item selected. No fallback support if endpoints array is not provided.
 * @param {string} last - Uses endpoints array only, last item selected. No fallback support if endpoints array is not provided.
 * @param {string} round-robin - Uses endpoints array only, alternates between endpoints. Starts with first item in array. No fallback support if endpoints array is not provided.
 * @param {string} fastest - Uses the fastest endpoint determined in the static initialization. No fallback support.
 * @param {string} highest-slot - Uses the highest slot endpoint determined in the static initialization. No fallback support.
 * @param {string} random - Uses endpoints array only, selects random item from array. No fallback support if endpoints array is not provided.
 * @param {string} latest-valid-block-height - Uses the endpoint with the latest valid block height.
 */
export type Mode = 'single' | 'first' | 'last' | 'round-robin' | 'random' | 'fastest' | 'highest-slot' | 'latest-valid-block-height';