/* eslint-disable @typescript-eslint/no-this-alias */
import { logger } from './logger'
// import { queuePromise } from './utils'
import * as path from 'path'
import * as os from 'os'
const sqlite3 = require('sqlite3').verbose()

// const si = require('search-index')

const promisify = function (func, instance) {
  // return function (...args) {
  //   return new Promise((resolve, reject) => {
  //     console.log('load', ...args);
  //     func(...args, (err, arg) => {
  //       if (err) reject(err)
  //       else resolve(arg)
  //     })
  //   });
  // }
  return (...arg: any) =>
    new Promise((resolve, reject) => {
      func.call(instance, ...arg, (err, result) => {
        if (err) reject(err)
        else resolve(result)
      })
    })
}

const promisifyForDone = function (func, instance) {
  return (obj: any) =>
    new Promise((resolve, reject) => {
      func.call(instance, {
        ...obj,
        done(err, result) {
          if (err) reject(err)
          else resolve(result)
        },
      })
    })
}

const tableColumn = [
  '_id',
  'text',
  'sessionId',
  'from',
  'time',
  'target',
  'to',
  'type',
  'scene',
  'idServer',
  'fromNick',
  'content',
]

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
  putFts(msgs: IMsg | IMsg[]): Promise<void>
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
  kJiebaCutSmall
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

/**
 * 全文搜索扩展函数
 * @param NimSdk im sdk的类
 */
const fullText = (NimSdk: any) => {
  return class FullTextNim extends NimSdk implements IFullTextNim {
    public static instance: FullTextNim | null
    queryOption: QueryOption
    enablePinyin: boolean
    searchDB: any
    ftLogFunc: (...args: any) => void
    // ignoreChars: string
    searchDBName: string
    searchDBPath: string
    fullSearchCutFunc?: (text: string) => string[]
    // 内部使用，对putFts做了并发保护
    // _putFts = queuePromise(this.putFts)
    _putFts = this.putFts

    constructor(initOpt: IInitOpt) {
      super(initOpt)

      const {
        account,
        appKey,
        // ignoreChars,
        queryOption,
        enablePinyin,
        searchDBName,
        searchDBPath,
        debug,
        ftLogFunc,
        fullSearchCutFunc,
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
      // this.ignoreChars =
      //   ignoreChars ||
      //   ' \t\r\n~!@#$%^&*()_+-=【】、{}|;\':"，。、《》？αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ。，、；：？！…—·ˉ¨‘’“”々～‖∶＂＇｀｜〃〔〕〈〉《》「」『』．〖〗【】（）［］｛｝ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ⒈⒉⒊⒋⒌⒍⒎⒏⒐⒑⒒⒓⒔⒕⒖⒗⒘⒙⒚⒛㈠㈡㈢㈣㈤㈥㈦㈧㈨㈩①②③④⑤⑥⑦⑧⑨⑩⑴⑵⑶⑷⑸⑹⑺⑻⑼⑽⑾⑿⒀⒁⒂⒃⒄⒅⒆⒇≈≡≠＝≤≥＜＞≮≯∷±＋－×÷／∫∮∝∞∧∨∑∏∪∩∈∵∴⊥∥∠⌒⊙≌∽√§№☆★○●◎◇◆□℃‰€■△▲※→←↑↓〓¤°＃＆＠＼︿＿￣―♂♀┌┍┎┐┑┒┓─┄┈├┝┞┟┠┡┢┣│┆┊┬┭┮┯┰┱┲┳┼┽┾┿╀╁╂╃└┕┖┗┘┙┚┛━┅┉┤┥┦┧┨┩┪┫┃┇┋┴┵┶┷┸┹┺┻╋╊╉╈╇╆╅╄'
      this.queryOption = queryOption || QueryOption.kDefault
      this.enablePinyin = enablePinyin || false
      this.searchDBName = searchDBName || `${account}-${appKey}`
      this.searchDBPath = searchDBPath || ''
      if (fullSearchCutFunc) {
        this.fullSearchCutFunc = fullSearchCutFunc
      }
    }

    public async initDB(): Promise<void> {
      const finalName = this.searchDBPath
        ? path.join(this.searchDBPath, `${this.searchDBName}.sqlite`)
        : `${this.searchDBName}.sqlite`
      const that = this
      this.searchDB = await new Promise(function (resolve, reject) {
        const db = new sqlite3.Database(finalName, function (err) {
          if (err) {
            that.ftLogFunc('initDB fail: ', err)
            reject(err)
            return
          }
          that.ftLogFunc('initDB success')
          resolve(db)
        })
      })
      // console.log(this.searchDB.run)
      // console.log(this.searchDB.all)
      this.searchDB.run = promisify(this.searchDB.run, this.searchDB)
      // this.searchDB.close = promisify(this.searchDB.close, this.searchDB)
      this.searchDB.all = promisify(this.searchDB.all, this.searchDB)
      await this.loadExtension()
      await this.createTable()
      await this.loadDict()
      // console.log(this.searchDB.close())
    }

    public async loadExtension(filePath?: string): Promise<void> {
      if (!filePath) {
        const type = os.type()
        const arch = os.arch()
        let libName = 'libsimple'
        if (type === 'Darwin') {
          libName = 'libsimple'
        } else {
          libName = 'simple.dll'
        }
        filePath = path.resolve(path.join(__dirname, libName).replace(/^(.+)asar(.node_modules.+)$/, '$1asar.unpacked$2'))
      }
      await new Promise((resolve, reject) => {
        this.searchDB.loadExtension(filePath, function (err) {
          if (err) {
            reject(err)
            return
          }
          resolve({})
        })
      })
    }

    public async loadDict(): Promise<void> {
      try {
        const resourcePath = path.resolve(path.join(__dirname).replace(/^(.+)asar(.node_modules.+)$/, '$1asar.unpacked$2'))
        const dictPath = path.join(resourcePath, 'dict').concat(process.platform === 'win32' ? '\\' : '/')
        console.log(dictPath)
        await this.searchDB.run(
          `SELECT jieba_dict("${dictPath}")`
        )
      } catch (err) {
        this.ftLogFunc('failed to load jieba dict: ', err)
      }
    }

    public async createTable(): Promise<void> {
      try {
        // simple 0 是为了禁止拼音
        const column = tableColumn.map((item) => '`' + item + '`').join(', ')
        await this.searchDB.run(
          `CREATE VIRTUAL TABLE IF NOT EXISTS t1 USING fts5(${column}, tokenize = 'simple 0')`
        )
      } catch (err) {
        this.ftLogFunc('create VIRTUAL table failed: ', err)
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
            this._putFts(obj)
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
            this._putFts(obj)
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

    public async deleteLocalMsgs(opt: any): Promise<void> {
      const getLocalMsgs = promisifyForDone(super.getLocalMsgs, this)
      const deleteLocalMsgs = promisifyForDone(super.deleteLocalMsgs, this)
      try {
        const obj: any = await getLocalMsgs({
          ...opt,
          limit: Infinity,
        })
        const result = await deleteLocalMsgs({
          ...opt,
        })
        if (obj.msgs && obj.msgs.length > 0) {
          const idClients = obj.msgs.map(msg => msg.idClient)
          await this.deleteFts(idClients)
        }
        opt.done && opt.done(null, result)
      } catch (err) {
        opt.done && opt.done(err)
      }
    }

    public async deleteLocalMsgsBySession(opt: any): Promise<void> {
      const getLocalMsgs = promisifyForDone(super.getLocalMsgs, this)
      const deleteLocalMsgsBySession = promisifyForDone(
        super.deleteLocalMsgsBySession,
        this
      )
      try {
        const obj: any = await getLocalMsgs({
          sessionId: `${opt.scene}-${opt.to}`,
          limit: Infinity,
        })
        const result = await deleteLocalMsgsBySession({
          ...opt,
        })
        if (obj.msgs && obj.msgs.length > 0) {
          const idClients = obj.msgs.map(msg => msg.idClient)
          await this.deleteFts(idClients)
        }
        opt.done && opt.done(null, result)
      } catch (err) {
        opt.done && opt.done(err)
      }
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
      return super.deleteMsgSelfBatch({
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

    public async getLocalMsgsToFts(opt: any): Promise<any> {
      let obj
      try {
        obj = await new Promise((resolve, reject) => {
          super.getLocalMsgs({
            ...opt,
            done: (err: any, obj: any) => {
              if (err) {
                reject(err)
                return
              }
              resolve(obj)
            },
          })
        })
      } catch (err) {
        opt.done && opt.done(err, null)
      }

      const msgs: IMsg[] = obj.msgs

      if (msgs && msgs.length > 0) {
        await this.putFts(msgs || [])
      }

      opt.done && opt.done(null, obj)

      // return super.getLocalMsgs({
      //   ...opt,
      //   done: (err: any, obj: any) => {
      //     if (!err) {
      //       this._putFts(obj.msgs)
      //     }
      //     opt.done && opt.done(err, obj)
      //   },
      // })
    }

    public async queryFts(params: IQueryParams): Promise<any> {
      try {
        // 入参过滤，去除多余的符号
        // text 就简单替换 ' 这种字符，换掉把
        if (params.text) {
          const reg = /[^\u4e00-\u9fa5^a-z^A-Z^0-9]/g
          params.text = params.text.replace(reg, ' ').trim()
        }
        if (params.text === '') {
          return []
        }

        const sql = this._handleQueryParams(params)
        const records = await this.searchDB.all(sql)
        // const records = await this.searchDB.QUERY(queryParams, queryOptions)
        // this.ftLogFunc('queryFts searchDB QUERY success', records)
        // const idClients = (records && records.map((item) => item._id)) || []
        // if (!idClients || !idClients.length) {
        //   this.ftLogFunc('queryFts 查询本地消息，无匹配词')
        //   throw '查询本地消息，无匹配词'
        // }
        // const res = await this._getLocalMsgsByIdClients(idClients)
        // this.ftLogFunc('queryFts success')

        // if (!(records && records.length > 0)) {
        //   throw 'No record suitable'
        // }
        return records
      } catch (error) {
        this.ftLogFunc('queryFts fail: ', error)
        throw error
      }
    }

    public async putFts(msgs: IMsg | IMsg[]): Promise<void> {
      if (!Array.isArray(msgs)) {
        msgs = [msgs]
      }
      // 去重
      const map = msgs.reduce((total, next) => {
        if (next.idClient) {
          total[next.idClient] = next
        }
        return total
      }, {})
      msgs = Object.keys(map).map(key => map[key])
      const fts = msgs
        .filter((msg) => msg.text && msg.idClient)
        .map((msg) => {
          return {
            _id: msg.idClient,
            text: msg.text,
            sessionId: msg.sessionId,
            from: msg.from,
            time: msg.time,
            target: msg.target,
            to: msg.to,
            type: msg.type,
            scene: msg.scene,
            idServer: msg.idServer,
            fromNick: msg.fromNick,
            content: msg.content,
          }
        })
      const ids = fts.map((item) => `"${item._id}"`).join(',')
      const existRows = await this.searchDB.all(
        `select rowid, _id from t1 where _id in (${ids})`
      )
      const existRowIds =
        existRows && existRows.length > 0 ? existRows.map((row) => row._id) : []
      const updates: any[] = []
      const inserts: any[] = []
      fts.forEach((item) => {
        const idx = existRowIds.indexOf(item._id)
        if (idx === -1) {
          inserts.push(item)
        } else {
          updates.push({
            ...item,
            rowid: existRows[idx].rowid,
          })
        }
      })

      if (inserts.length > 0) {
        console.log('插入', inserts.length, '条')
        await new Promise((resolve, reject) => {
          this.searchDB.serialize(async () => {
            try {
              const stmt = this.searchDB.prepare(
                `INSERT OR IGNORE INTO t1 VALUES (${tableColumn.map(item => '?').join(',')})`
              )
              this.searchDB.exec('BEGIN TRANSACTION')
              inserts.forEach((msg: IMsg) => {
                stmt.run(
                  msg._id, msg.text, msg.sessionId, msg.from, msg.time,
                  msg.target, msg.to, msg.type, msg.scene, msg.idServer,
                  msg.fromNick, msg.content
                )
              })
              this.searchDB.exec('COMMIT')
              stmt.finalize(function (err) {
                if (err) {
                  reject(err)
                } else {
                  resolve({})
                }
              })
            } catch (err) {
              this.searchDB.exec('ROLLBACK TRANSACTION')
              reject(err)
            }
          })
        })
      }

      if (updates.length > 0) {
        console.log('修改', updates.length, '条')
        await new Promise((resolve, reject) => {
          this.searchDB.serialize(async () => {
            try {
              const stmt = this.searchDB.prepare(
                'UPDATE `t1` SET `_id`=?,`text`=?,`sessionId`=?,`from`=?,`time`=? where `rowid`=?'
              )
              this.searchDB.exec('BEGIN TRANSACTION')
              updates.forEach((msg: IMsg) => {
                stmt.run(
                  msg._id,
                  msg.text,
                  msg.sessionId,
                  msg.from,
                  msg.time,
                  msg.rowid
                )
              })
              this.searchDB.exec('COMMIT')
              stmt.finalize(function (err) {
                if (err) {
                  reject(err)
                } else {
                  resolve({})
                }
              })
            } catch (err) {
              this.searchDB.exec('ROLLBACK TRANSACTION')
              reject(err)
            }
          })
        })
      }

      // const promises = fts.map(item => {
      //   return this.searchDB.run(`
      //     INSERT OR REPLACE
      //     INTO t1 (\`rowid\`, \`_id\`, \`text\`, \`sessionId\`, \`from\`, \`time\`) VALUES
      //     ((SELECT \`rowid\` FROM t1 WHERE \`_id\` = "${item._id}" LIMIT 1), "${item._id}", "${item.text}", "${item.sessionId}", "${item.from}", "${item.time}")
      //   `)
      // })

      // try {
      //   await Promise.all(promises)
      //   this.ftLogFunc('putFts success', fts)
      // } catch (err) {
      //   this.ftLogFunc('putFts fail: ', err)
      //   throw err
      // }

      // return new Promise((resolve, reject) => {
      //   const stmt = this.searchDB.prepare(
      //     'INSERT OR IGNORE INTO t1 VALUES (?, ?, ?, ?, ?)'
      //   )
      //   msgs.forEach((msg: IMsg) => {
      //     stmt.run(msg.idClient, msg.text, msg.sessionId, msg.from, msg.time)
      //   })
      //   stmt.finalize(function (err) {
      //     if (err) {
      //       reject(err)
      //     } else {
      //       resolve({})
      //     }
      //   })
      // })
      //   .then(() => {
      //     this.ftLogFunc('putFts success', fts)
      //   })
      //   .catch((error) => {
      //     this.ftLogFunc('putFts fail: ', error)
      //     throw error
      //   })
    }

    public async deleteFts(ids: string | string[]): Promise<void> {
      let idsString = ''
      if (Array.isArray(ids)) {
        idsString = ids.map((id) => `"${id}"`).join(',')
      } else {
        idsString = `"${ids}"`
      }
      // if (Object.prototype.toString.call(ids) !== '[object Array]') {
      //   idsString = ids.join(',')
      // } else {
      //   idsString = ids
      // }

      try {
        // await this.searchDB.DELETE(ids)
        await this.searchDB.run(`DELETE FROM t1 WHERE _id in (${idsString});`)
        this.ftLogFunc('deleteFts success', ids)
      } catch (error) {
        this.ftLogFunc('deleteFts fail: ', error)
        throw error
      }
    }

    public async clearAllFts(): Promise<void> {
      try {
        console.time('dropTable')
        await this.searchDB.run('drop table if exists t1')
        console.timeEnd('dropTable')
        console.time('createTable')
        await this.createTable()
        console.timeEnd('createTable')

        // console.time('deleteTable')
        // await this.searchDB.run('DELETE FROM t1;')
        // console.timeEnd('deleteTable')
        this.ftLogFunc('clearAllFts success')
      } catch (error) {
        this.ftLogFunc('clearAllFts fail: ', error)
        throw error
      }
    }

    public destroy(...args: any): void {
      new Promise((resolve, reject) => {
        this.searchDB.close(function (err) {
          if (err) {
            reject(err)
            return
          }
          resolve({})
        })
      })
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
      offset = 0,
      start,
      end,
      queryOption = this.queryOption
    }: IQueryParams): string {
      // `select _id from t1 where text match simple_query('${params.text}') limit ${limit} offset 0;`
      const where: string[] = []
      if (text) {
        where.push(`\`text\` MATCH query('${text}', ${queryOption}, ${this.enablePinyin})`)
      }
      if (sessionIds && sessionIds.length > 0) {
        const temp = sessionIds.map((id: string) => `'${id}'`).join(',')
        where.push(`\`sessionId\` IN (${temp})`)
      }
      if (froms && froms.length > 0) {
        const temp = froms.map((from: string) => `'${from}'`).join(',')
        where.push(`\`from\` IN (${temp})`)
      }
      if (start) {
        where.push(`\`time\` >= ${start}`)
      }
      if (end) {
        where.push(`\`time\` < ${end}`)
      }

      let order = ''
      if (timeDirection === 'ascend') {
        order = `ORDER BY time ASC`
      } else if (timeDirection === 'descend') {
        order = `ORDER BY time DESC`
      }

      let limitQuery = ''
      if (limit !== Infinity) {
        limitQuery = `LIMIT ${limit} offset ${offset}`
      }
      const column = tableColumn
        .slice(1)
        .map(item => '`' + item + '`')
        .join(', ')
      const sql = `select \`_id\` as \`idClient\`, ${column} from t1 where ${where.join(
        ' AND '
      )} ${order} ${limitQuery}`
      this.ftLogFunc('_handleQueryParams: ', sql)
      return sql
    }

    // 分词函数
    // _cut(text: string): string[] {
    //   let res: string[]
    //   if (this.fullSearchCutFunc) {
    //     res = this.fullSearchCutFunc(text)
    //   } else {
    //     res = text.split('')
    //   }
    //   return res.filter((word) => !this.ignoreChars.includes(word))
    // }

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
          throw err
        }
      }
      return NimSdk.getInstance({
        ...initOpt,
        onroamingmsgs: (obj, ...rest) => {
          obj && obj.msgs && this.instance?._putFts(obj.msgs)
          initOpt.onroamingmsgs && initOpt.onroamingmsgs(obj, ...rest)
        },
        onofflinemsgs: (obj, ...rest) => {
          obj && obj.msgs && this.instance?._putFts(obj.msgs)
          initOpt.onofflinemsgs && initOpt.onofflinemsgs(obj, ...rest)
        },
        onmsg: (...args: any) => {
          this.instance?._putFts(args[0])
          initOpt.onmsg && initOpt.onmsg(...args)
        },
        onDeleteMsgSelf: (...args: any) => {
          // 删除 fts
          const msgs = args[0]
          const ids = msgs && msgs.map(msg => msg.idClient)
          if (ids) {
            this.instance?.deleteFts(ids)
          }
          initOpt.onDeleteMsgSelf && initOpt.onDeleteMsgSelf(...args)
        },
        onsysmsg: (obj, ...rest) => {
          // 撤回
          if (obj && obj.type === 'deleteMsg') {
            this.instance?.deleteFts(obj.deletedIdClient)
          }
          initOpt.onsysmsg && initOpt.onsysmsg(obj, ...rest)
        },
        onofflinesysmsgs: (obj, ...rest) => {
          const ids = obj && obj.map(msg => msg.type === 'deleteMsg' && msg.deletedIdClient)
          if (ids) {
            this.instance?.deleteFts(ids)
          }
          initOpt.onofflinesysmsgs && initOpt.onofflinesysmsgs(obj, ...rest)
        },
      })
    }
  }
}

export default fullText
