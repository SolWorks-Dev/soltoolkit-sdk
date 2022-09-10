import { Cluster, Commitment, Connection, ConnectionConfig } from '@solana/web3.js';
import { ILogger } from '../interfaces/ILogger';
import { Logger } from './Logger';

export class ConnectionManager {
    private static _instance: ConnectionManager;
    public _connection: Connection;
    public _fastestEndpoint: string;
    private _config: IConnectionManagerConstructor;
    private _logger: ILogger = new Logger('@soltoolkit/ConnectionManager');

    private constructor(
        {
            network = 'mainnet-beta',
            endpoint,
            config,
            commitment = 'confirmed',
            endpoints,
            mode = 'single'
        }: IConnectionManagerConstructor,
        fastestEndpoint?: string
    ) {
        let rpcUrl: string | undefined;

        this._logger.debug(
            `Initializing ConnectionManager with params: ${JSON.stringify(
                {
                    network,
                    endpoint,
                    config,
                    commitment,
                    endpoints,
                    mode,
                    fastestEndpoint
                },
                null,
                2
            )}`
        );

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
                        throw new Error('No endpoints provided with mode "fallback"');
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
            // TODO
            case 'fastest': {
                if (endpoints && endpoints.length > 0 && fastestEndpoint) {
                    rpcUrl = fastestEndpoint;
                } else {
                    throw new Error('No fastest endpoint provided with mode "fastest"');
                }
                break;
            }
            case 'weighted':
                {
                    throw new Error('Not implemented yet');
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

        this._logger.debug(`Using endpoint: ${rpcUrl}`);

        this._connection = new Connection(rpcUrl, {
            ...config,
            commitment,
            confirmTransactionInitialTimeout: 120000
        });
        this._config = {
            network,
            endpoint,
            config,
            commitment,
            endpoints,
            mode
        };
        this._fastestEndpoint = fastestEndpoint || rpcUrl;
    }

    public static async getInstance(values: IConnectionManagerConstructor) {
        if (!ConnectionManager._instance) {
            const endpoints = values.endpoints
                ? values.endpoints
                : values.endpoint !== undefined
                    ? [values.endpoint]
                    : [this.getDefaultEndpoint(values.network)];
            const fatestEndpoint = await ConnectionManager.getFastestEndpoint(endpoints);
            ConnectionManager._instance = new ConnectionManager(values, fatestEndpoint.endpoint);
        }

        return ConnectionManager._instance;
    }

    // allowDefault value is ignored for airdrop
    public conn({
        changeConn = true,
        airdrop = false
    }: {
        changeConn?: boolean;
        airdrop?: boolean;
    }): Connection {
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
                case 'fastest': {
                    if (this._connection.rpcEndpoint !== this._fastestEndpoint) {
                        this._logger.info(`Changing connection to ${this._fastestEndpoint}`);
                        conn = new Connection(this._fastestEndpoint, this._config.config || this._config.commitment);
                    }
                    break;
                }
                case 'weighted':
                    throw new Error('Not implemented yet');
                case 'round-robin':
                    {
                        const currentIndex = this._config.endpoints?.indexOf(this._connection.rpcEndpoint);
                        if (currentIndex === -1) {
                            if (this._connection.rpcEndpoint === ConnectionManager.getDefaultEndpoint(this._config.network)) {
                                conn = new Connection(this._config.endpoints![0], this._config.config || this._config.commitment);
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
                default:
                    this._logger.error('Invalid mode');
                    conn = this._connection;
                    break;
            }
        }

        this._logger.debug(`Using endpoint: ${conn.rpcEndpoint}`);
        this._connection = conn;
        return conn;
    }

    public async getEndpointsSummary(): Promise<IRPCSummary[]> {
        const endpoints = this._config.endpoints || [this._connection.rpcEndpoint];
        return await ConnectionManager.getEndpointsSummary(endpoints);
    }

    public static async getEndpointsSummary(endpoints: string[]): Promise<IRPCSummary[]> {
        const results = await Promise.all(
            endpoints.map(async (endpoint) => {
                const conn = new Connection(endpoint);
                const start = Date.now();
                await conn.getEpochInfo();
                const end = Date.now();
                const speedMs = end - start;
                return {
                    endpoint,
                    speedMs
                };
            })
        );

        return results;
    }

    public static async getFastestEndpoint(endpoints: string[]): Promise<IRPCSummary> {
        let summary = await ConnectionManager.getEndpointsSummary(endpoints);
        summary = summary.sort((a, b) => a.speedMs - b.speedMs);
        return summary[0];
    }

    public static getDefaultEndpoint(network: string | undefined) {
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

interface IConnectionManagerConstructor {
    network: Cluster;
    endpoint?: string;
    endpoints?: string[];
    config?: ConnectionConfig;
    commitment?: Commitment;
    mode?: Mode;
}

interface IRPCSummary {
    endpoint: string;
    speedMs: number;
}

type Mode = 'single' | 'first' | 'last' | 'round-robin' | 'random' | 'fastest' | 'weighted';
