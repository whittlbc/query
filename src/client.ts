import {
    SpecTableClientOptions,
    StringKeyMap,
    QueryPayload,
    SelectOptions,
    QueryResponse,
    onBatchCallback,
} from './lib/types'
import config from './lib/config'
import { buildSelectQuery } from './lib/utils/queryBuilder'
import fetch, { Response } from 'node-fetch'
import { sleep } from './lib/utils/time'
import { JSONParser } from '@streamparser/json'
import { camelizeKeys } from 'humps'

const DEFAULT_OPTIONS = {
    origin: config.SHARED_TABLES_ORIGIN,
    respTimeout: config.QUERY_RESPONSE_TIMEOUT,
    streamBatchSize: config.STREAM_BATCH_SIZE,
}

/**
 * Query client for Spec's shared tables.
 */
class SpecQueryClient {

    protected apiKey: string

    protected origin: string

    protected respTimeout: number

    protected streamBatchSize: number

    get queryUrl(): string {
        const url = new URL(this.origin)
        url.pathname = '/query'
        return url.toString()
    }

    get streamUrl(): string {
        const url = new URL(this.origin)
        url.pathname = '/stream'
        return url.toString()
    }

    get requestHeaders(): StringKeyMap {
        return {
            'Content-Type': 'application/json',
            [config.SHARED_TABLES_AUTH_HEADER_NAME]: this.apiKey,
        }
    }

    /**
     * Create a new client instance.
     */
    constructor(options?: SpecTableClientOptions) {
        const settings = { ...DEFAULT_OPTIONS, ...options }
        this.apiKey = settings.apiKey!
        this.origin = settings.origin
        this.respTimeout = settings.respTimeout
        this.streamBatchSize = settings.streamBatchSize
    }

    /**
     * Build and perform a basic select query for the given table and filters.
     */
    async query(table: string, options?: SelectOptions): Promise<QueryResponse> {
        options = options || {}
        const filters = options.where || []

        // Make initial request.
        let resp
        try {
            resp = await this._performQuery(
                this.queryUrl, 
                buildSelectQuery(table, filters, options),
            )
        } catch (err) {
            return { error: err as string }
        }

        // Parse JSON response.
        let data
        try {
            data = await this._parseResponse(resp)
        } catch (err) {
            return { error: err as string }
        }

        return { data: camelizeKeys(data || []) }
    }

    /**
     * Build and perform a query with streamed results.
     */
     async stream(
        table: string,
        options: SelectOptions,
        onBatch: onBatchCallback,
    ) {
        options = options || {}
        const filters = options.where || []

        const resp = await this._performQuery(
            this.streamUrl,
            buildSelectQuery(table, filters, options),
        )

        await this._handleStreamResponse(resp, onBatch)
    }

    async _handleStreamResponse(resp: Response, onBatch: onBatchCallback) {
        const sharedContext = { error: null }

        // Timer for breaks in streamed data.
        const abortController = new AbortController()
        let chunkTimer: any = null
        const renewTimer = () => {
            chunkTimer && clearTimeout(chunkTimer)
            chunkTimer = setTimeout(() => abortController.abort(), this.respTimeout)
        }
        renewTimer()

        // JSON parser for streamed response data.
        const jsonParser = new JSONParser({
            stringBufferSize: undefined,
            paths: ['$.*'],
            keepStack: false,
        })

        // Parse each JSON object and add it to a batch.
        let pendingDataPromise: any = null
        let batch: StringKeyMap[] = []
        jsonParser.onValue = (obj) => {
            if (!obj) return
            obj = obj as StringKeyMap

            // Throw any errors explicitly passed back
            if (obj.error) throw obj.error
            
            // snakecase to camelcase.
            obj = camelizeKeys(obj)
            batch.push(obj)

            // Batch is ready.
            if (batch.length === this.streamBatchSize) {
                pendingDataPromise = onBatch([...batch]).catch((err) => {
                    sharedContext.error = err
                })
                batch = []
            }
        }

        // Iterate over readable stream.
        let chunk
        try {
            for await (chunk of resp.body) {
                renewTimer()
                if (sharedContext.error) {
                    throw `Error handling streamed response data: ${sharedContext.error}`
                }
                if (pendingDataPromise) {
                    await pendingDataPromise
                    pendingDataPromise = null
                }
                jsonParser.write(chunk)
            }
        } catch (err) {
            chunkTimer && clearTimeout(chunkTimer)
            throw `Error iterating response stream: ${JSON.stringify(err)}`
        }
        chunkTimer && clearTimeout(chunkTimer)

        // Handle any data remaining in last batch.
        if (batch.length) {
            await onBatch([...batch])
        }
    }

    /**
     * Perform a query and return the JSON-parsed result.
     */
    async _performQuery(
        url: string,
        payload: QueryPayload | QueryPayload[],
        attempts: number = 0,
    ): Promise<Response> {
        // Set up query timeout timer.
        const abortController = new AbortController()
        const timer = setTimeout(() => abortController.abort(), this.respTimeout)

        // Make initial HTTP request.
        let resp, error
        try {
            resp = await this._makeRequest(url, payload, abortController)
        } catch (err) {
            error = err
        }
        clearTimeout(timer)
        if (error) throw error
        
        // Potentially retry.
        const status = resp?.status
        if (!status || status >= 500 && attempts < 3) {
            await sleep(500)
            return await this._performQuery(url, payload, attempts + 1)    
        }

        // Failure.
        if (status !== 200 || attempts >= 3) {
            let data
            try {
                data = await this._parseResponse(resp)
            } catch (err) {
                error = err
            }
            throw `Request failed with status ${status}: ${data?.error || error}`
        }

        return resp
    }

    /**
     * Initial query POST request.
     */
    async _makeRequest(
        url: string,
        payload: StringKeyMap | StringKeyMap[],
        abortController: AbortController,
    ): Promise<Response> {
        try {
            return await fetch(url, {
                method: 'POST',
                headers: this.requestHeaders,
                body: JSON.stringify(payload),
                signal: abortController.signal,
            })
        } catch (err) {
            throw `Query request error: ${err}`
        }
    }

    /**
     * Parse JSON HTTP response.
     */
    async _parseResponse(resp: Response): Promise<StringKeyMap[]> {
        try {
            return (await resp.json()) || []
        } catch (err) {
            throw `Failed to parse JSON response data: ${err}`
        }
    }
}

export default SpecQueryClient