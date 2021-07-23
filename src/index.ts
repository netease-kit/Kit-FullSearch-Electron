/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-this-alias */
import { logger } from './logger'
import { promisify, promisifyForDone } from './utils'
import { IFullTextNim, IInitOpt, QueryOption, IQueryParams, IMsg } from './type'
import * as path from 'path'
import * as os from 'os'
const sqlite3 = require('sqlite3').verbose()

const tableColumn = [
  'id',
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
      this.searchDB.run = promisify(this.searchDB.run, this.searchDB)
      this.searchDB.all = promisify(this.searchDB.all, this.searchDB)
      this.searchDB.close = promisify(this.searchDB.close, this.searchDB)
      await this.loadExtension()
      await this.createTable()
      await this.loadDict()

      // 检查 db，异步检查即可
      this.checkDbSafe()
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
        await this.searchDB.run(`SELECT jieba_dict("${dictPath}")`)
      } catch (err) {
        this.ftLogFunc('failed to load jieba dict: ', err)
      }
    }

    public async checkDbSafe(): Promise<void> {
      try {
        await this.searchDB.run(`INSERT INTO nim_msglog_fts(nim_msglog_fts) VALUES('integrity-check');`)
      } catch (err) {
        this.emit('ftsDamaged', err)
      }
    }

    public async rebuildDbIndex(): Promise<void> {
      return await this.searchDB.run(`INSERT INTO nim_msglog_fts(nim_msglog_fts) VALUES('rebuild');`)
    }

    public formatSQLText(src: string): string {
      // sqlite 语法，语句中一个单引号转为两个单引号，还是当作一个转义好的单引号插入
      return src.replace(/\'/gi, `''`)
    }

    public async createTable(): Promise<void> {
      try {
        // simple 0 是为了禁止拼音
        await this.searchDB.run(`
          CREATE TABLE IF NOT EXISTS "nim_msglog" (
            "id"        INTEGER PRIMARY KEY AUTOINCREMENT,
            "idClient"  TEXT NOT NULL UNIQUE,
            "text"      TEXT,
            "sessionId" TEXT NOT NULL,
            "from"      TEXT NOT NULL,
            "time"      INTEGER NOT NULL,
            "target"    NUMERIC NOT NULL,
            "to"        TEXT NOT NULL,
            "type"      TEXT,
            "scene"     TEXT,
            "idServer"  INTEGER NOT NULL,
            "fromNick"  TEXT,
            "content"   TEXT
          );`
        )
        await this.searchDB.run(`
          CREATE VIRTUAL TABLE IF NOT EXISTS nim_msglog_fts USING fts5(
            [idClient] UNINDEXED,
            [text],
            [sessionId] UNINDEXED,
            [from] UNINDEXED,
            [time] UNINDEXED,
            [target] UNINDEXED,
            [to] UNINDEXED,
            [type] UNINDEXED,
            [scene] UNINDEXED,
            [idServer] UNINDEXED,
            [fromNick] UNINDEXED,
            [content] UNINDEXED,
            content = [nim_msglog], content_rowid = id, tokenize = 'simple 0'
          );`
        )
        await this.searchDB.run(`
          CREATE TRIGGER nim_msglog_ai AFTER INSERT ON nim_msglog 
          BEGIN 
            INSERT INTO nim_msglog_fts (
              rowid,idClient,text,sessionId,[from],time,target,[to],type,scene,idServer,fromNick,content
            ) VALUES (
              new.id,new.idClient,new.text,new.sessionId,new.[from],new.time,new.target,
              new.[to],new.type,new.scene,new.idServer,new.fromNick,new.content
            );
          END;`
        )
        await this.searchDB.run(`
          CREATE TRIGGER nim_msglog_ad AFTER DELETE ON nim_msglog
          BEGIN
            INSERT INTO nim_msglog_fts (
              nim_msglog_fts,rowid,idClient,text,sessionId,[from],
              time,target,[to],type,scene,idServer,fromNick,content
            ) VALUES (
              'delete',old.id,old.idClient,old.text,old.sessionId,old.[from],old.time,old.target,
              old.[to],old.type,old.scene,old.idServer,old.fromNick,old.content
            );
          END;`
        )
        await this.searchDB.run(`
          CREATE TRIGGER nim_msglog_au AFTER UPDATE ON nim_msglog
          BEGIN
            INSERT INTO nim_msglog_fts (
              nim_msglog_fts,rowid,idClient,text,sessionId,[from],time,target,[to],type,scene,idServer,fromNick,content
            ) VALUES (
              'delete',old.id,old.idClient,old.text,old.sessionId,old.[from],old.time,
              old.target,old.[to],old.type,old.scene,old.idServer,old.fromNick,old.content
            );
            INSERT INTO nim_msglog_fts (
              rowid,idClient,text,sessionId,[from],time,target,[to],type,scene,idServer,fromNick,content
            ) VALUES (
              new.id,new.idClient,new.text,new.sessionId,new.[from],
              new.time,new.target,new.[to],new.type,new.scene,new.idServer,new.fromNick,new.content
            );
          END;`
        )
      } catch (err) {
        this.ftLogFunc('create VIRTUAL table failed: ', err)
        this.emit('ftsError', err)
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
        // 入参过滤，去除多余的符号，text 替换 ' 字符
        if (params.text) {
          const reg = /[^\u4e00-\u9fa5^a-z^A-Z^0-9]/g
          params.text = params.text.replace(reg, ' ').trim()
        }
        let records: Array<any> = []
        // 如果替换后字符串为空并且传入的 sessionIDs 和 fromIDs 都为空
        // 则不走查询逻辑
        if (params.text.length === 0 &&
          (params.sessionIds && params.sessionIds.length === 0) &&
          (params.froms && params.froms.length === 0)) {
          return records
        }
        const sql = this._handleQueryParams(params)
        records = await this.searchDB.all(sql)
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
      const msgs = isStock
        ? this.msgStockQueue.splice(0, 3000)
        : this.msgQueue.splice(0, 3000)

      // const { inserts, updates } = await this._getMsgsWithInsertAndUpdate(msgs)
      const fts = await this._getMsgsWithInsertAndUpdate(msgs)

      if (fts.length > 0) {
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
        const column = tableColumn.map(() => '?').join(',')
        this.searchDB.serialize(async () => {
          try {
            this.searchDB.exec('BEGIN TRANSACTION;')
            msgs.forEach((msg) => {
              this.searchDB.run(`INSERT OR IGNORE INTO \`nim_msglog\` VALUES(NULL,${column});`, [
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
              ])
            })
            this.searchDB.exec('COMMIT;', function (err) {
              if (err) {
                that.emit('ftsError', err)
                reject(err)
                return
              }
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

    public async deleteFts(ids: string | string[]): Promise<void> {
      let idsString = ''
      if (Array.isArray(ids)) {
        idsString = ids.map((id) => `"${id}"`).join(',')
      } else {
        idsString = `"${ids}"`
      }
      try {
        // await this.searchDB.DELETE(ids)
        await this.searchDB.run(`DELETE FROM nim_msglog WHERE idClient in (${idsString});`)
        this.ftLogFunc('deleteFts success', ids)
      } catch (error) {
        this.ftLogFunc('deleteFts fail: ', error)
        throw error
      }
    }

    public async clearAllFts(): Promise<void> {
      try {
        await this.searchDB.run('DELETE FROM `nim_msglog`;')
      } catch (error) {
        this.ftLogFunc('clearAllFts fail: ', error)
        throw error
      }
    }

    public async dropAllFts(): Promise<void> {
      try {
        await this.searchDB.run('drop table if exists nim_msglog;')
        await this.searchDB.run('drop table if exists nim_msglog_fts;')
        await this.searchDB.run('drop trigger if exists nim_msglog_au;')
        await this.searchDB.run('drop trigger if exists nim_msglog_ai;')
        await this.searchDB.run('drop trigger if exists nim_msglog_ad;')
        await this.createTable()
        this.ftLogFunc('dropAllFts success')
      } catch (error) {
        this.ftLogFunc('dropAllFts fail: ', error)
        throw error
      }
    }

    public async destroy(...args: any): Promise<void> {
      // 清空队列和定时器，关闭 db。
      this.timeout && clearTimeout(this.timeout)
      this.msgStockQueue = []
      this.msgQueue = []
      try {
        await this.searchDB.close()
        this.ftLogFunc('close searchDB success')
      } catch (err) {
        this.ftLogFunc('close searchDB fail: ', err)
        this.emit('ftsError', err)
      }
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
        limitQuery = `LIMIT ${limit} OFFSET ${offset}`
      }
      const column = tableColumn
        .slice(1)
        .map((item) => '`' + item + '`')
        .join(', ')

      const whereSQL = where.length > 0 ? `where ${where.join(' AND ')}` : ''
      const sql = `SELECT \`idClient\`, ${column} from nim_msglog_fts ${whereSQL} ${order} ${limitQuery}`
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
