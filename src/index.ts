/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-this-alias */
import { logger } from './logger'
import { promisify, promisifyForDone } from './utils'
import { IFullTextNim, IInitOpt, QueryOption, IQueryParams, IMsg } from './type'
import * as path from 'path'
import * as os from 'os'
const sqlite3 = require('sqlite3').verbose()

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
    msgStockQueue: any[]
    msgQueue: any[]
    timeout: number

    constructor(initOpt: IInitOpt) {
      super(initOpt)

      const {
        account,
        appKey,
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
      this.queryOption = queryOption || QueryOption.kDefault
      this.enablePinyin = enablePinyin || false
      this.searchDBName = searchDBName || `${account}-${appKey}`
      this.searchDBPath = searchDBPath || ''
      this.msgQueue = []
      this.msgStockQueue = []
      this.timeout = 0
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
        filePath = path.resolve(
          path
            .join(__dirname, libName)
            .replace(/^(.+)asar(.node_modules.+)$/, '$1asar.unpacked$2')
        )
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
        const resourcePath = path.resolve(
          path
            .join(__dirname)
            .replace(/^(.+)asar(.node_modules.+)$/, '$1asar.unpacked$2')
        )
        const dictPath = path
          .join(resourcePath, 'dict')
          .concat(process.platform === 'win32' ? '\\' : '/')
        // console.log(dictPath)
        await this.searchDB.run(`SELECT jieba_dict("${dictPath}")`)
      } catch (err) {
        this.ftLogFunc('failed to load jieba dict: ', err)
      }
    }

    public formatSQLText(src: string): string {
      return src.replace(/\'/gi, `''`)
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
          const idClients = obj.msgs.map((msg) => msg.idClient)
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
          const idClients = obj.msgs.map((msg) => msg.idClient)
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
        this.putFts(msgs || [], true)
      }

      opt.done && opt.done(null, obj)
    }

    public async queryFts(params: IQueryParams): Promise<any> {
      try {
        // 入参过滤，去除多余的符号
        // text 就简单替换 ' 这种字符，换掉把
        if (params.text) {
          const reg = /[^\u4e00-\u9fa5^a-z^A-Z^0-9]/g
          params.text = params.text.replace(reg, ' ').trim()
        }

        const sql = this._handleQueryParams(params)
        const records = await this.searchDB.all(sql)
        return records
      } catch (error) {
        this.ftLogFunc('queryFts fail: ', error)
        throw error
      }
    }

    public putFts(msgs: IMsg | IMsg[], isStock = false): void {
      if (!Array.isArray(msgs)) {
        msgs = [msgs]
      }
      if (isStock) {
        this.msgStockQueue = this.msgStockQueue.concat(msgs)
      } else {
        this.msgQueue = this.msgQueue.concat(msgs)
      }
      // 设置定时器，开始同步
      if (!this.timeout) {
        this.timeout = (setTimeout(() => {
          this._putFts(isStock)
        }, 0) as unknown) as number
      }
    }

    async _putFts(isStock = false): Promise<void> {
      console.time('一批 3000 个putFts耗时')
      const msgs = isStock
        ? this.msgStockQueue.splice(0, 3000)
        : this.msgQueue.splice(0, 3000)

      // const { inserts, updates } = await this._getMsgsWithInsertAndUpdate(msgs)
      const fts = await this._getMsgsWithInsertAndUpdate(msgs)

      if (fts.length > 0) {
        // console.log('插入', fts.length, '条')
        await this._doInsert(fts)
        isStock
          ? this.emit(
              'ftsStockUpsert',
              fts.length,
              this.msgQueue.length,
              this.msgStockQueue.length,
              fts[fts.length - 1].time
            )
          : this.emit('ftsUpsert', fts.length, this.msgQueue.length)
      }

      // if (updates.length > 0) {
      //   console.log('修改', updates.length, '条')
      //   await this._doUpdate(updates)
      // }

      // 队列里还存在未同步的，那么继续定时执行
      if (this.msgStockQueue.length > 0) {
        this.timeout = (setTimeout(() => {
          this._putFts(true)
        }, 100) as unknown) as number
      } else if (this.msgQueue.length > 0) {
        this.timeout = (setTimeout(() => {
          this._putFts()
        }, 100) as unknown) as number
      } else {
        this.timeout = 0
      }

      console.timeEnd('一批 3000 个putFts耗时')
    }

    async _getMsgsWithInsertAndUpdate(msgs: IMsg[]): Promise<IMsg[]> {
      // 去重
      const map = msgs.reduce((total, next) => {
        if (next.idClient) {
          total[next.idClient] = next
        }
        return total
      }, {})
      msgs = Object.keys(map).map((key) => map[key])
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
      return fts
    }

    async _doInsert(msgs: IMsg[]): Promise<void> {
      const that = this
      return new Promise((resolve, reject) => {
        const column = tableColumn.map(item => '?').join(',')
        this.searchDB.serialize(async () => {
          try {
            this.searchDB.exec('BEGIN TRANSACTION;')
            msgs.map((msg, index) => {
              this.searchDB.run(`INSERT OR IGNORE INTO \`t1\` VALUES(${column});`, [
                msg._id,
                msg.text,
                msg.sessionId,
                msg.from,
                msg.time,
                msg.target,
                msg.to,
                msg.type,
                msg.scene,
                msg.idServer,
                msg.fromNick,
                msg.content
              ], function (err) {
                if (err) {
                  // console.log(err, JSON.stringify(msg))
                  that.emit('ftsError', err, JSON.stringify(msg))
                }
              })
            })
            this.searchDB.exec('COMMIT;', function (err) {
              if (err) {
                // console.log('insert commit error: ', err)
                that.emit('ftsError', err)
                reject(err)
                return
              }
              // that.emit('ftsUpsert', that.msgQueue.length)
              resolve()
            })
          } catch (err) {
            this.searchDB.exec('ROLLBACK TRANSACTION;', function (err) {
              that.ftLogFunc('rollback: ', err)
            })
            reject(err)
          }
        })
      })
    }

    // async _doUpdate(msgs: IMsg[]): Promise<void> {
    //   const that = this
    //   return new Promise((resolve, reject) => {
    //     this.searchDB.serialize(async () => {
    //       try {
    //         this.searchDB.exec('BEGIN TRANSACTION')
    //         msgs.map((msg: IMsg, index) => {
    //           this.searchDB.run(`UPDATE \`t1\` SET \`_id=?\`, \`text\`=?, \`sessionId=\`=?, \`from\`=? \`time\`=? WHERE \`rowid\`=?;`,
    //             msg._id, msg.text, msg.sessionId, msg.from, msg.time, msg.rowid, function (err) {
    //               if (err) {
    //                 console.log(err)
    //               }
    //             }
    //           )
    //         })
    //         this.searchDB.exec('COMMIT TRANSACTION;', function (err) {
    //           if (err) {
    //             console.log('update commit error: ', err)
    //             return
    //           }
    //           that.emit('ftsUpsert', that.msgQueue.length)
    //           resolve()
    //         })
    //       } catch (err) {
    //         this.searchDB.exec('ROLLBACK TRANSACTION', function (err) {
    //           console.log('rollback: ', err)
    //         })
    //         reject(err)
    //       }
    //     })
    //   })
    // }

    // public async putFts(msgs: IMsg | IMsg[]): Promise<void> {
    //   // let msgs = this.msgQueue.splice(0, 1000)
    //   if (!Array.isArray(msgs)) {
    //     msgs = [msgs]
    //   }
    //   // 去重
    //   const map = msgs.reduce((total, next) => {
    //     if (next.idClient) {
    //       total[next.idClient] = next
    //     }
    //     return total
    //   }, {})
    //   msgs = Object.keys(map).map((key) => map[key])
    //   const fts = msgs
    //     .filter((msg) => msg.text && msg.idClient)
    //     .map((msg) => {
    //       return {
    //         _id: msg.idClient,
    //         text: msg.text,
    //         sessionId: msg.sessionId,
    //         from: msg.from,
    //         time: msg.time,
    //         target: msg.target,
    //         to: msg.to,
    //         type: msg.type,
    //         scene: msg.scene,
    //         idServer: msg.idServer,
    //         fromNick: msg.fromNick,
    //         content: msg.content,
    //       }
    //     })
    //   const ids = fts.map((item) => `"${item._id}"`).join(',')
    //   const existRows = await this.searchDB.all(
    //     `select rowid, _id from t1 where _id in (${ids})`
    //   )
    //   const existRowIds =
    //     existRows && existRows.length > 0 ? existRows.map((row) => row._id) : []
    //   const updates: any[] = []
    //   const inserts: any[] = []
    //   fts.forEach((item) => {
    //     const idx = existRowIds.indexOf(item._id)
    //     if (idx === -1) {
    //       inserts.push(item)
    //     } else {
    //       updates.push({
    //         ...item,
    //         rowid: existRows[idx].rowid,
    //       })
    //     }
    //   })

    //   if (inserts.length > 0) {
    //     console.log('插入', inserts.length, '条')
    //     await new Promise((resolve, reject) => {
    //       this.searchDB.serialize(async () => {
    //         try {
    //           this.searchDB.exec('BEGIN TRANSACTION;')
    //           const sqls = inserts.map((msg, index) => {
    //             const sql =
    //               `INSERT OR IGNORE INTO \`t1\` VALUES(` +
    //               `'${msg._id}',` +
    //               `'${this.formatSQLText(msg.text)}',` +
    //               `'${msg.sessionId}',` +
    //               `'${msg.from}',` +
    //               `'${msg.time}',` +
    //               `'${msg.target}',` +
    //               `'${msg.to}',` +
    //               `'${msg.type}',` +
    //               `'${msg.scene}',` +
    //               `'${msg.idServer}',` +
    //               `'${msg.fromNick}',` +
    //               `'${this.formatSQLText(msg.content || '')}'` +
    //               `)`
    //             // if (index === 1) {
    //             //   insertSQL += '))'
    //             // }
    //             this.searchDB.exec(sql, function (err) {
    //               if (err) {
    //                 console.log('insert exec error: ', err)
    //               } else {
    //                 console.log('insert exec success')
    //               }
    //             })
    //             // return sql
    //             return `${msg._id}, ${msg.time}`
    //           })
    //           this.searchDB.exec('COMMIT;', function (err) {
    //             console.log('执行消息对象：\n', sqls.join('\n'))
    //             if (err) {
    //               console.log('insert commit error: ', err)
    //             } else {
    //               console.log('insert commit success')
    //             }
    //             resolve(null)
    //           })
    //         } catch (err) {
    //           this.searchDB.exec('ROLLBACK TRANSACTION;', function (err) {
    //             console.log('rollback: ', err)
    //           })
    //           reject(err)
    //         }
    //       })
    //     })
    //   }

    //   if (updates.length > 0) {
    //     console.log('修改', updates.length, '条')
    //     await new Promise((resolve, reject) => {
    //       this.searchDB.serialize(async () => {
    //         try {
    //           // const stmt = this.searchDB.prepare(
    //           //   'UPDATE `t1` SET `_id`=?,`text`=?,`sessionId`=?,`from`=?,`time`=? where `rowid`=?'
    //           // )
    //           this.searchDB.exec('BEGIN TRANSACTION')
    //           const sqls = updates.map((msg: IMsg, index) => {
    //             const sql =
    //               `UPDATE \`t1\` SET` +
    //               `\`_id\`='${msg._id}',` +
    //               `\`text\`='${this.formatSQLText(msg.text)}',` +
    //               `\`sessionId\`='${msg.sessionId}',` +
    //               `\`from\`='${msg.from}',` +
    //               `\`time\`='${msg.time}'` +
    //               ` WHERE \`rowid\`='${msg.rowid}';`

    //             this.searchDB.exec(sql, function (err) {
    //               // 事件通知用户语句执行出错
    //               if (err) {
    //                 console.log('update exec error: ', err)
    //               } else {
    //                 console.log('update exec success')
    //               }
    //             })
    //             return `${msg._id}, ${msg.time}`
    //           })
    //           this.searchDB.exec('COMMIT;', function (err) {
    //             console.log('执行消息对象：\n', sqls.join('\n'))
    //             if (err) {
    //               console.log('update commit error: ', err)
    //             } else {
    //               console.log('update commit success')
    //             }
    //             resolve(null)
    //           })
    //         } catch (err) {
    //           this.searchDB.exec('ROLLBACK TRANSACTION', function (err) {
    //             console.log('rollback: ', err)
    //           })
    //           reject(err)
    //         }
    //       })
    //     })
    //   }
    // }

    public async deleteFts(ids: string | string[]): Promise<void> {
      let idsString = ''
      if (Array.isArray(ids)) {
        idsString = ids.map((id) => `"${id}"`).join(',')
      } else {
        idsString = `"${ids}"`
      }
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
      queryOption = this.queryOption,
    }: IQueryParams): string {
      // `select _id from t1 where text match simple_query('${params.text}') limit ${limit} offset 0;`
      const where: string[] = []
      if (text) {
        const queryText = this.formatSQLText(text)
        where.push(
          `\`text\` MATCH query('${queryText}', ${queryOption}, ${this.enablePinyin})`
        )
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
        .map((item) => '`' + item + '`')
        .join(', ')

      const whereSQL = where.length > 0 ? `where ${where.join(' AND ')}` : ''
      const sql = `select \`_id\` as \`idClient\`, ${column} from t1 ${whereSQL} GROUP BY \`idClient\` ${order} ${limitQuery}`
      this.ftLogFunc('_handleQueryParams: ', sql)
      return sql
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
          obj && obj.msgs && this.instance?.putFts(obj.msgs)
          initOpt.onroamingmsgs && initOpt.onroamingmsgs(obj, ...rest)
        },
        onofflinemsgs: (obj, ...rest) => {
          obj && obj.msgs && this.instance?.putFts(obj.msgs)
          initOpt.onofflinemsgs && initOpt.onofflinemsgs(obj, ...rest)
        },
        onmsg: (...args: any) => {
          this.instance?.putFts(args[0])
          initOpt.onmsg && initOpt.onmsg(...args)
        },
        onDeleteMsgSelf: (...args: any) => {
          // 删除 fts
          const msgs = args[0]
          const ids = msgs && msgs.map((msg) => msg.idClient)
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
          const ids =
            obj &&
            obj.map((msg) => msg.type === 'deleteMsg' && msg.deletedIdClient)
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
