import { logger } from './logger'

const nodejieba = require('nodejieba')
const si = require('search-index')

export interface IFullTextNim {
  initDB(): Promise<void>
  sendText(opt: any): void
  sendCustomMsg(opt: any): void
  saveMsgsToLocal(opt: any): void
  getLocalMsgs(opt: any): void
  deleteMsg(opt: any): void
  deleteLocalMsg(opt: any): void
  deleteAllLocalMsgs(opt: any): void
  deleteMsgSelf(opt: any): void
  deleteMsgSelfBatch(opt: any): void
  queryFts(text: string, limit?: number): Promise<any>
  putFts(msgs: Msg | Msg[]): Promise<void>
  deleteFts(ids: string | string[]): Promise<void>
  clearAllFts(): Promise<void>
  destroy(...args: any): void
}

export interface IInitOpt {
  account: string
  appKey: string
  ignoreChars?: string
  searchDBName?: string
  logFunc?: (...args: any) => void
  debug?: boolean
  [key: string]: any
}

export interface Msg {
  [key: string]: any
}

/**
 * 全文搜索扩展函数
 * @param NimSdk im sdk的类
 */
const fullText = (NimSdk: any) => {
  return class FullTextNim extends NimSdk implements IFullTextNim {
    public static instance: FullTextNim | null
    searchDB: any
    nodejieba = nodejieba
    logFunc: (...args: any) => void
    ignoreChars: string
    searchDBName: string

    constructor(initOpt: IInitOpt) {
      super(initOpt)

      const {
        account,
        appKey,
        ignoreChars,
        searchDBName,
        debug,
        logFunc,
      } = initOpt

      // 初始化logger
      if (debug) {
        this.logFunc = logFunc || logger.log.bind(logger)
      } else {
        this.logFunc = () => {}
      }

      if (!account || !appKey) {
        this.logFunc('invalid init params!')
        throw new Error('invalid init params!')
      }
      this.ignoreChars =
        ignoreChars ||
        ' \t\r\n~!@#$%^&*()_+-=【】、{}|;\':"，。、《》？αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ。，、；：？！…—·ˉ¨‘’“”々～‖∶＂＇｀｜〃〔〕〈〉《》「」『』．〖〗【】（）［］｛｝ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ⒈⒉⒊⒋⒌⒍⒎⒏⒐⒑⒒⒓⒔⒕⒖⒗⒘⒙⒚⒛㈠㈡㈢㈣㈤㈥㈦㈧㈨㈩①②③④⑤⑥⑦⑧⑨⑩⑴⑵⑶⑷⑸⑹⑺⑻⑼⑽⑾⑿⒀⒁⒂⒃⒄⒅⒆⒇≈≡≠＝≤≥＜＞≮≯∷±＋－×÷／∫∮∝∞∧∨∑∏∪∩∈∵∴⊥∥∠⌒⊙≌∽√§№☆★○●◎◇◆□℃‰€■△▲※→←↑↓〓¤°＃＆＠＼︿＿￣―♂♀┌┍┎┐┑┒┓─┄┈├┝┞┟┠┡┢┣│┆┊┬┭┮┯┰┱┲┳┼┽┾┿╀╁╂╃└┕┖┗┘┙┚┛━┅┉┤┥┦┧┨┩┪┫┃┇┋┴┵┶┷┸┹┺┻╋╊╉╈╇╆╅╄'
      this.searchDBName = searchDBName || `${account}-${appKey}`
    }

    public static async getInstance(initOpt: IInitOpt) {
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

    public async initDB(): Promise<void> {
      try {
        this.searchDB = await si({
          name: `NIM-FULLTEXT-SEARCHDB-${this.searchDBName}`,
          // @ts-ignore
          storeVectors: true,
        })
        this.logFunc('initDB success')
      } catch (err) {
        this.logFunc('initDB fail: ', err)
        return Promise.reject(err)
      }
    }

    public sendText(opt: any) {
      super.sendText({
        ...opt,
        done: (err: any, obj: any) => {
          if (!err && obj.idClient) {
            this.putFts(obj)
          }
          opt.done && opt.done(err, obj)
        },
      })
    }

    public sendCustomMsg(opt: any) {
      super.sendCustomMsg({
        ...opt,
        done: (err: any, obj: any) => {
          if (!err && obj.idClient) {
            this.putFts(obj)
          }
          opt.done && opt.done(err, obj)
        },
      })
    }

    public saveMsgsToLocal(opt: any) {
      super.saveMsgsToLocal({
        ...opt,
        done: (err: any, obj: any) => {
          if (!err) {
            this.putFts(obj)
          }
          opt.done && opt.done(err, obj)
        },
      })
    }

    public deleteMsg(opt: any) {
      super.deleteMsg({
        ...opt,
        done: (err: any, obj: any) => {
          if (!err && opt.msg && opt.msg.idClient) {
            this.deleteFts(opt.msg.idClient)
          }
          opt.done && opt.done(err, obj)
        },
      })
    }

    public deleteLocalMsg(opt: any) {
      super.deleteLocalMsg({
        ...opt,
        done: (err: any, obj: any) => {
          if (!err && opt.msg && opt.msg.idClient) {
            this.deleteFts(opt.msg.idClient)
          }
          opt.done && opt.done(err, obj)
        },
      })
    }

    public deleteAllLocalMsgs(opt: any) {
      super.deleteAllLocalMsgs({
        ...opt,
        done: (err: any, obj: any) => {
          if (!err) {
            this.clearAllFts()
          }
          opt.done && opt.done(err, obj)
        },
      })
    }

    public deleteMsgSelf(opt: any) {
      super.deleteMsgSelf({
        ...opt,
        done: (err: any, obj: any) => {
          if (!err && opt.msg && opt.msg.idClient) {
            this.deleteFts(opt.msg.idClient)
          }
          opt.done && opt.done(err, obj)
        },
      })
    }

    public deleteMsgSelfBatch(opt: any) {
      super.deleteMsgSelf({
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

    public getLocalMsgs(opt: any) {
      super.getLocalMsgs({
        ...opt,
        done: (err: any, obj: any) => {
          if (!err) {
            this.putFts(obj.msgs)
          }
          opt.done && opt.done(err, obj)
        },
      })
    }

    public async queryFts(text: string, limit = 100): Promise<any> {
      var searchParams = nodejieba
        .cut(text)
        .filter((word) => !this.ignoreChars.includes(word))
      try {
        const records = await this.searchDB.QUERY({
          SEARCH: searchParams,
        })
        this.logFunc('queryFts searchDB QUERY success', records)
        let idClients = records.RESULT.map((item) => item._id).slice(0, limit)
        if (!idClients || !idClients.length) {
          this.logFunc('queryFts 查询本地消息，无匹配词')
          throw '查询本地消息，无匹配词'
        }
        const res = await this._getLocalMsgsByIdClients(idClients)
        this.logFunc('queryFts success')
        return res
      } catch (error) {
        this.logFunc('queryFts fail: ', error)
        return Promise.reject(error)
      }
    }

    public async putFts(msgs: Msg | Msg[]): Promise<void> {
      if (Object.prototype.toString.call(msgs) !== '[object Array]') {
        msgs = [msgs]
      }
      // 分词，并过滤无意义的符号
      var fts = msgs
        .filter((msg) => msg.text && msg.idClient)
        .map((msg) => ({
          idx: nodejieba
            .cut(msg.text)
            .filter((word) => !this.ignoreChars.includes(word)),
          _id: msg.idClient,
        }))

      try {
        await this.searchDB.PUT(fts)
        this.logFunc('putFts success', fts)
      } catch (error) {
        this.logFunc('putFts fail: ', error)
        return Promise.reject(error)
      }
    }

    public async deleteFts(ids: string | string[]): Promise<void> {
      if (Object.prototype.toString.call(ids) !== '[object Array]') {
        ids = [ids as string]
      }
      try {
        await this.searchDB.DELETE(ids)
        this.logFunc('deleteFts success', ids)
      } catch (error) {
        this.logFunc('deleteFts fail: ', error)
        return Promise.reject(error)
      }
    }

    public async clearAllFts(): Promise<void> {
      try {
        await this.searchDB.FLUSH()
        this.logFunc('clearAllFts success')
      } catch (error) {
        this.logFunc('clearAllFts fail: ', error)
        return Promise.reject(error)
      }
    }

    public destroy(...args: any) {
      this.searchDB.INDEX.STORE.close()
        .then(() => {
          this.logFunc('close searchDB success')
        })
        .catch((error) => {
          this.logFunc('close searchDB fail: ', error)
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
              this.logFunc('_getLocalMsgsByIdClients fail: ', err)
              return reject(err)
            }
            this.logFunc('_getLocalMsgsByIdClients success', obj)
            resolve(obj)
          },
        })
      })
    }
  }
}

export default fullText
