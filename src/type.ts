export interface IFullTextNim {
  initDB(): Promise<void>
  loadExtension(): Promise<void>
  sendText(opt: any): any
  sendCustomMsg(opt: any): any
  saveMsgsToLocal(opt: any): any
  getLocalMsgsToFts(opt: any): any
  deleteMsg(opt: any): any
  deleteLocalMsg(opt: any): any
  deleteAllLocalMsgs(opt: any): any
  deleteMsgSelf(opt: any): any
  deleteMsgSelfBatch(opt: any): any
  queryFts(params: IQueryParams): Promise<any>
  putFts(msgs: IMsg | IMsg[]): void
  _putFts(): Promise<void>
  _doInsert(msgs: IMsg[]): Promise<void>
  // _doUpdate(msgs: IMsg[]): Promise<void>
  deleteFts(ids: string | string[]): Promise<void>
  clearAllFts(): Promise<void>
  destroy(...args: any): void
}

export interface IInitOpt {
  account: string
  appKey: string
  debug?: boolean
  // ignoreChars?: string
  searchDBName?: string
  searchDBPath?: string
  ftLogFunc?: (...args: any) => void
  fullSearchCutFunc?: (text: string) => string[]
  [key: string]: any
}

export type IDirection = 'ascend' | 'descend'

export type ILogic = 'and' | 'or'

export enum QueryOption {
  kDefault,
  kSimple,
  kJiebaCutWithHMM,
  kJiebaCutWithoutHMM,
  kJiebaCutAll,
  kJiebaCutForSearch,
  kJiebaCutHMM,
  kJiebaCutSmall,
}

export interface IQueryParams {
  text: string
  limit?: number
  offset?: number
  sessionIds?: string[]
  froms?: string[]
  timeDirection?: IDirection
  start?: number
  end?: number
  textLogic?: ILogic
  sessionIdLogic?: ILogic
  fromsLogic?: ILogic
  queryOption?: QueryOption
}

export interface IMsg {
  [key: string]: any
}

export interface ISiItem {
  _id: string
  time: number
  sessionId: string
  idx: string
}
