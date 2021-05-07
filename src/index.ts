import { logger } from './logger'

const nodejieba = require('nodejieba')
const si = require('search-index')

export interface IFullTextNim {
  initDB(): Promise<void>
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
  putFts(msgs: IMsg | IMsg[]): Promise<void>
  deleteFts(ids: string | string[]): Promise<void>
  clearAllFts(): Promise<void>
  destroy(...args: any): void
}

export interface IInitOpt {
  account: string
  appKey: string
  ignoreChars?: string
  searchDBName?: string
  searchDBPath?: string
  ftLogFunc?: (...args: any) => void
  debug?: boolean
  [key: string]: any
}

export type IDirection = 'ascend' | 'descend'

export type ILogic = 'and' | 'or'

export interface IQueryParams {
  text: string
  limit?: number
  sessionIds?: string[]
  froms?: string[]
  timeDirection?: IDirection
  start?: number
  end?: number
  textLogic?: ILogic
  sessionIdLogic?: ILogic
  fromsLogic?: ILogic
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

/**
 * 全文搜索扩展函数
 * @param NimSdk im sdk的类
 */
const fullText = (NimSdk: any) => {
  return class FullTextNim extends NimSdk implements IFullTextNim {
    public static instance: FullTextNim | null
    searchDB: any
    ftLogFunc: (...args: any) => void
    ignoreChars: string
    searchDBName: string
    searchDBPath: string

    constructor(initOpt: IInitOpt) {
      super(initOpt)

      const {
        account,
        appKey,
        ignoreChars,
        searchDBName,
        searchDBPath,
        debug,
        ftLogFunc,
      } = initOpt

      // 初始化logger
      if (debug) {
        this.ftLogFunc = logger.log.bind(logger)
      } else {
        this.ftLogFunc = (): void => {
          // i'm empty
        }
      }
      if (ftLogFunc) {
        this.ftLogFunc = ftLogFunc
      }

      if (!account || !appKey) {
        this.ftLogFunc('invalid init params!')
        throw new Error('invalid init params!')
      }
      this.ignoreChars =
        ignoreChars ||
        ' \t\r\n~!@#$%^&*()_+-=【】、{}|;\':"，。、《》？αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ。，、；：？！…—·ˉ¨‘’“”々～‖∶＂＇｀｜〃〔〕〈〉《》「」『』．〖〗【】（）［］｛｝ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ⒈⒉⒊⒋⒌⒍⒎⒏⒐⒑⒒⒓⒔⒕⒖⒗⒘⒙⒚⒛㈠㈡㈢㈣㈤㈥㈦㈧㈨㈩①②③④⑤⑥⑦⑧⑨⑩⑴⑵⑶⑷⑸⑹⑺⑻⑼⑽⑾⑿⒀⒁⒂⒃⒄⒅⒆⒇≈≡≠＝≤≥＜＞≮≯∷±＋－×÷／∫∮∝∞∧∨∑∏∪∩∈∵∴⊥∥∠⌒⊙≌∽√§№☆★○●◎◇◆□℃‰€■△▲※→←↑↓〓¤°＃＆＠＼︿＿￣―♂♀┌┍┎┐┑┒┓─┄┈├┝┞┟┠┡┢┣│┆┊┬┭┮┯┰┱┲┳┼┽┾┿╀╁╂╃└┕┖┗┘┙┚┛━┅┉┤┥┦┧┨┩┪┫┃┇┋┴┵┶┷┸┹┺┻╋╊╉╈╇╆╅╄'
      this.searchDBName = searchDBName || `${account}-${appKey}`
      this.searchDBPath = searchDBPath || ''
    }

    public async initDB(): Promise<void> {
      try {
        const finalName = this.searchDBPath
          ? `${this.searchDBPath}/NIM-FULLTEXT-SEARCHDB-${this.searchDBName}`
          : `NIM-FULLTEXT-SEARCHDB-${this.searchDBName}`
        this.searchDB = await si({
          name: finalName,
          // @ts-ignore
          storeVectors: true,
        })
        this.ftLogFunc('initDB success')
      } catch (err) {
        this.ftLogFunc('initDB fail: ', err)
        return Promise.reject(err)
      }
    }

    public sendText(opt: any): any {
      return super.sendText({
        ...opt,
        done: (err: any, obj: any) => {
          if (!err && obj.idClient) {
            this.putFts(obj)
          }
          opt.done && opt.done(err, obj)
        },
      })
    }

    public sendCustomMsg(opt: any): any {
      return super.sendCustomMsg({
        ...opt,
        done: (err: any, obj: any) => {
          if (!err && obj.idClient) {
            this.putFts(obj)
          }
          opt.done && opt.done(err, obj)
        },
      })
    }

    public saveMsgsToLocal(opt: any): any {
      return super.saveMsgsToLocal({
        ...opt,
        done: (err: any, obj: any) => {
          if (!err) {
            this.putFts(obj)
          }
          opt.done && opt.done(err, obj)
        },
      })
    }

    public deleteMsg(opt: any): any {
      return super.deleteMsg({
        ...opt,
        done: (err: any, obj: any) => {
          if (!err && opt.msg && opt.msg.idClient) {
            this.deleteFts(opt.msg.idClient)
          }
          opt.done && opt.done(err, obj)
        },
      })
    }

    public deleteLocalMsg(opt: any): any {
      return super.deleteLocalMsg({
        ...opt,
        done: (err: any, obj: any) => {
          if (!err && opt.msg && opt.msg.idClient) {
            this.deleteFts(opt.msg.idClient)
          }
          opt.done && opt.done(err, obj)
        },
      })
    }

    public deleteAllLocalMsgs(opt: any): any {
      return super.deleteAllLocalMsgs({
        ...opt,
        done: (err: any, obj: any) => {
          if (!err) {
            this.clearAllFts()
          }
          opt.done && opt.done(err, obj)
        },
      })
    }

    public deleteMsgSelf(opt: any): any {
      return super.deleteMsgSelf({
        ...opt,
        done: (err: any, obj: any) => {
          if (!err && opt.msg && opt.msg.idClient) {
            this.deleteFts(opt.msg.idClient)
          }
          opt.done && opt.done(err, obj)
        },
      })
    }

    public deleteMsgSelfBatch(opt: any): any {
      return super.deleteMsgSelf({
        ...opt,
        done: (err: any, obj: any) => {
          if (!err && opt.msgs && opt.msgs.length) {
            const ids = opt.msgs.map((item) => item.idClient)
            this.deleteFts(ids)
          }
          opt.done && opt.done(err, obj)
        },
      })
    }

    public getLocalMsgsToFts(opt: any): any {
      return super.getLocalMsgs({
        ...opt,
        done: (err: any, obj: any) => {
          if (!err) {
            this.putFts(obj.msgs)
          }
          opt.done && opt.done(err, obj)
        },
      })
    }

    public async queryFts(params: IQueryParams): Promise<any> {
      try {
        const { queryParams, queryOptions } = this._handleQueryParams(params)
        const records = await this.searchDB.QUERY(queryParams, queryOptions)
        this.ftLogFunc('queryFts searchDB QUERY success', records)
        const idClients = records.RESULT.map((item) => item._id)
        if (!idClients || !idClients.length) {
          this.ftLogFunc('queryFts 查询本地消息，无匹配词')
          throw '查询本地消息，无匹配词'
        }
        const res = await this._getLocalMsgsByIdClients(idClients)
        this.ftLogFunc('queryFts success')
        return res
      } catch (error) {
        this.ftLogFunc('queryFts fail: ', error)
        return Promise.reject(error)
      }
    }

    public async putFts(msgs: IMsg | IMsg[]): Promise<void> {
      if (Object.prototype.toString.call(msgs) !== '[object Array]') {
        msgs = [msgs]
      }
      const fts: ISiItem[] = []
      msgs
        .filter((msg) => msg.text && msg.idClient)
        .forEach((msg) => {
          const temp: ISiItem[] = this._cut(msg.text).map((txt) => ({
            _id: msg.idClient,
            idx: txt,
            time: msg.time,
            sessionId: this._filterAccountChar(msg.sessionId),
            froms: this._filterAccountChar(msg.from),
          }))
          fts.push(...temp)
        })
      try {
        await this.searchDB.PUT(fts)
        this.ftLogFunc('putFts success', fts)
      } catch (error) {
        this.ftLogFunc('putFts fail: ', error)
        return Promise.reject(error)
      }
    }

    public async deleteFts(ids: string | string[]): Promise<void> {
      if (Object.prototype.toString.call(ids) !== '[object Array]') {
        ids = [ids as string]
      }
      try {
        await this.searchDB.DELETE(ids)
        this.ftLogFunc('deleteFts success', ids)
      } catch (error) {
        this.ftLogFunc('deleteFts fail: ', error)
        return Promise.reject(error)
      }
    }

    public async clearAllFts(): Promise<void> {
      try {
        await this.searchDB.FLUSH()
        this.ftLogFunc('clearAllFts success')
      } catch (error) {
        this.ftLogFunc('clearAllFts fail: ', error)
        return Promise.reject(error)
      }
    }

    public destroy(...args: any): void {
      this.searchDB.INDEX.STORE.close()
        .then(() => {
          this.ftLogFunc('close searchDB success')
        })
        .catch((error) => {
          this.ftLogFunc('close searchDB fail: ', error)
        })
      FullTextNim.instance = null
      super.destroy(...args)
    }

    _getLocalMsgsByIdClients(idClients: any): Promise<any> {
      return new Promise((resolve, reject) => {
        super.getLocalMsgsByIdClients({
          idClients,
          done: (err: any, obj: any) => {
            if (err) {
              this.ftLogFunc('_getLocalMsgsByIdClients fail: ', err)
              return reject(err)
            }
            this.ftLogFunc('_getLocalMsgsByIdClients success', obj)
            resolve(obj)
          },
        })
      })
    }

    // 处理QUERY参数
    _handleQueryParams({
      text,
      sessionIds,
      froms,
      timeDirection,
      limit = 100,
      start,
      end,
      textLogic = 'and',
      sessionIdLogic = 'or',
      fromsLogic = 'or',
    }: IQueryParams): { queryParams: any; queryOptions: any } {
      const cutItem = (this._cut(text) || []).map((item) => `idx:${item}`)
      const queryParams =
        textLogic === 'and'
          ? { SEARCH: cutItem }
          : { SEARCH: [{ OR: cutItem }] }
      if (sessionIds && sessionIds.length) {
        const sessionIdItem = sessionIds.map(
          (sid) => `sessionId:${this._filterAccountChar(sid)}`
        )
        if (sessionIdLogic === 'or') {
          // @ts-ignore
          queryParams.SEARCH.push({
            OR: sessionIdItem,
          })
        } else if (sessionIdLogic === 'and') {
          // @ts-ignore
          queryParams.SEARCH.push(...sessionIdItem)
        }
      }

      if (froms && froms.length) {
        const fromItem = froms.map(
          (from) => `from:${this._filterAccountChar(from)}`
        )
        if (fromsLogic === 'or') {
          // @ts-ignore
          queryParams.SEARCH.push({
            OR: fromItem,
          })
        } else if (fromsLogic === 'and') {
          // @ts-ignore
          queryParams.SEARCH.push(...fromItem)
        }
      }

      const queryOptions: { PAGE: any; SORT?: any } = {
        PAGE: {
          NUMBER: 0,
          SIZE: limit,
        },
      }
      if (timeDirection || start || end) {
        // 按照时间排序，search-index需要先查询时加入time字段
        const timeItem: any = { FIELD: 'time' }
        if (start !== undefined) {
          timeItem.VALUE = {
            GTE: this._fillTimeString(start),
          }
        }
        if (end !== undefined) {
          timeItem.VALUE = {
            ...timeItem.VALUE,
            LTE: this._fillTimeString(end),
          }
        }
        queryParams.SEARCH.push(timeItem as any)
        if (timeDirection) {
          queryOptions.SORT = {
            TYPE: 'NUMERIC',
            DIRECTION: timeDirection === 'descend' ? 'DESCENDING' : 'ASCENDING',
            FIELD: '_match.time',
          }
        }
      }

      this.ftLogFunc('_handleQueryParams: ', { queryParams, queryOptions })
      return { queryParams, queryOptions }
    }

    // 分词函数
    _cut(text: string): string[] {
      return nodejieba
        .cut(text)
        .filter((word) => !this.ignoreChars.includes(word))
    }

    // 补齐时间戳，用以满足search-index的RANGE，参见issue: https://github.com/fergiemcdowall/search-index/issues/542
    _fillTimeString(t: number): string {
      // 理论上13位已经是一个很长的时间范围了
      const maxLength = 13
      let _t = t + ''
      if (_t.length < maxLength) {
        _t = _t.padStart(maxLength, '0')
      }
      return _t
    }

    // 过滤account和sessionId中的符号，因为search-index 不支持符号
    _filterAccountChar(text: string): string {
      return text.replace(/[\-\.\_\@]/g, 'ft')
    }

    public static async getInstance(initOpt: IInitOpt): Promise<any> {
      if (!this.instance) {
        this.instance = new FullTextNim(initOpt)
        try {
          await this.instance.initDB()
        } catch (err) {
          return Promise.reject(err)
        }
      }
      return NimSdk.getInstance({
        ...initOpt,
        onroamingmsgs: (...args: any) => {
          this.instance?.putFts(args[0])
          initOpt.onroamingmsgs && initOpt.onroamingmsgs(...args)
        },
        onofflinemsgs: (...args: any) => {
          this.instance?.putFts(args[0])
          initOpt.onofflinemsgs && initOpt.onofflinemsgs(...args)
        },
        onmsg: (...args: any) => {
          this.instance?.putFts(args[0])
          initOpt.onmsg && initOpt.onmsg(...args)
        },
      })
    }
  }
}

export default fullText
