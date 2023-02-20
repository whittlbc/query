export type StringKeyMap = { [key: string]: any }

export type StringMap = { [key: string]: string }

export type SpecTableClientOptions = {
    apiKey: string
    origin?: string
    respTimeout?: number
    streamBatchSize?: number
}

export type QueryPayload = {
    sql: string
    bindings: any[]
}

export enum FilterOp {
    EqualTo = '=',
    NotEqualTo = '!=',
    GreaterThan = '>',
    GreaterThanOrEqualTo = '>=',
    LessThan = '<',
    LessThanOrEqualTo = '<=',
    In = 'in',
    NotIn = 'not in',
}

export interface Filter {
    op: FilterOp
    value: any
}

export type Filters = StringKeyMap | StringKeyMap[]

export enum OrderByDirection {
    ASC = 'asc',
    DESC = 'desc',
}

export type OrderBy = {
    column: string
    direction: OrderByDirection
}

export type SelectOptions = {
    where?: Filters
    orderBy?: OrderBy
    offset?: number
    limit?: number
}

export type QueryResponse = {
    data?: StringKeyMap[]
    error?: string
}

export type onBatchCallback = (data: StringKeyMap[]) => Promise<void>