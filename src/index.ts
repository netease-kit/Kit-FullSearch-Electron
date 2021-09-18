/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-this-alias */
import { configure, getLogger } from 'log4js'
import { promisify, promisifyForDone } from './utils'
import { IFullTextNim, IInitOpt, QueryOption, IQueryParams, IMsg } from './type'
import * as path from 'path'
import * as os from 'os'
// import fs from 'fs'
const fs = require('fs')
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
    // ftLogFunc: (...args: any) => void
    // ignoreChars: string
    searchDBName: string
    searchDBPath: string
    fullSearchCutFunc?: (text: string) => string[]
    msgStockQueue: any[]
    msgQueue: any[]
    timeout: any
    logger: any

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
        // ftLogFunc,
        // fullSearchCutFunc,
      } = initOpt
      if (!account || !appKey) {
        throw new Error('invalid init params!')
      }
      this.queryOption = queryOption || QueryOption.kDefault
      this.enablePinyin = enablePinyin || false
      this.searchDBName = searchDBName || `${account}-${appKey}`
      this.searchDBPath = searchDBPath || ''
      this.msgQueue = []
      this.msgStockQueue = []
      this.timeout = 0
      
      // 初始化logger
      configure({
        appenders: {
          ftsLog: {
            type: 'file',
            filename: path.join(this.searchDBPath, this.searchDBName + '.log')
          },
          console: {
            type: 'console'
          }
        },
        categories: {
          default: {
            appenders: debug ? ['ftsLog', 'console'] : ['ftsLog'],
            level: "ALL"
          }
        }
      })
      this.logger = getLogger()
    }

    public async initDB(): Promise<void> {
      const finalName = this.searchDBPath
        ? path.join(this.searchDBPath, `${this.searchDBName}.sqlite`)
        : `${this.searchDBName}.sqlite`
      const that = this

      this.searchDB = await new Promise(function (resolve, reject) {
        const db = new sqlite3.Database(finalName, function (err) {
          if (err) {
            that.logger.info('failed to open database: ', err)
            reject(err)
            return
          }
          that.logger.info('open database successfully')
          resolve(db)
        })
      })
      this.searchDB.run = promisify(this.searchDB.run, this.searchDB)
      this.searchDB.all = promisify(this.searchDB.all, this.searchDB)
      // this.searchDB.close = promisify(this.searchDB.close, this.searchDB)
      await this.loadExtension()
      await this.createTable()
      await this.loadDict()
      await this.backupDBFile()
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
        this.logger.info(`Load extension from file: ${filePath}`)
        this.searchDB.loadExtension(filePath, (err) => {
          if (err) {
            this.logger.info(`Load extension failed ！from file: ${filePath}`)
            reject(err)
            return
          }
          this.logger.info(`Load extension success ！from file: ${filePath}`)
          resolve({})
        })
      })
    }

    public async loadDict(): Promise<void> {
      this.logger.info('load dict start')
      const resourcePath = path.resolve(
        path
          .join(__dirname)
          .replace(/^(.+)asar(.node_modules.+)$/, '$1asar.unpacked$2')
      )
      const dictPath = path
        .join(resourcePath, 'dict')
        .concat(process.platform === 'win32' ? '\\' : '/')
      await this.searchDB.run(`SELECT jieba_dict("${dictPath}")`)
      this.logger.info('load dict success')
    }

    public async backupDBFile(): Promise<void> {
      const srcFile = path.join(this.searchDBPath, `${this.searchDBName}.sqlite`)
      const dstFile = path.join(this.searchDBPath, `${this.searchDBName}.sqlite.backup`)
      try {
        // remove exists backup DB file
        if (fs.existsSync(dstFile)) {
          fs.unlinkSync(dstFile)
        }
        fs.copyFileSync(srcFile, dstFile)
        this.logger.info(`backup DB file from ${srcFile} to ${dstFile}`)
      } catch (err) {
        this.logger.info(`failed to backup DB file from ${srcFile} to ${dstFile}, error: ${err}`)
      }
    }

    public async restoreDBFile(): Promise<void> {
      const srcFile = path.join(this.searchDBPath, `${this.searchDBName}.sqlite.backup`)
      const dstFile = path.join(this.searchDBPath, `${this.searchDBName}.sqlite`)
      return new Promise((resolve, reject) => {
        this.searchDB.close((err) => {
          if (err) {
            reject(err)
          } else {
            resolve({})
          }
        })
      }).then(() => {
        if (fs.existsSync(dstFile)) {
          fs.unlinkSync(dstFile)
        }
        fs.copyFileSync(srcFile, dstFile)
        // remove backup file
        fs.unlinkSync(srcFile)
        this.logger.info(`restore DB file from ${srcFile} to ${dstFile}`)
      }).catch(() => {
        this.logger.info(`failed to restore DB file.`)
      })
    }

    public async checkDbSafe(): Promise<void> {
      try {
        await this.searchDB.run(`INSERT INTO nim_msglog_fts(nim_msglog_fts) VALUES('integrity-check');`)
      } catch (err) {
        this.emit('ftsDamaged', err)
        this.logger.error(err)
        throw new Error(err)
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
      // simple 0 是为了禁止拼音
      this.logger.info('create table start')
      await this.searchDB.run(`
        CREATE TABLE IF NOT EXISTS "nim_msglog" (
          "id"        INTEGER PRIMARY KEY AUTOINCREMENT,
          "idClient"  TEXT NOT NULL UNIQUE,
          "text"      TEXT,
          "sessionId" TEXT NOT NULL,
          "from"      TEXT NOT NULL,
          "time"      INTEGER NOT NULL,
          "target"    TEXT NOT NULL,
          "to"        TEXT NOT NULL,
          "type"      TEXT,
          "scene"     TEXT,
          "idServer"  TEXT NOT NULL,
          "fromNick"  TEXT,
          "content"   TEXT
        );`
      )
      this.logger.info('create table nim_msglog success')
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
      this.logger.info('create table nim_msglog_fts success')
      await this.searchDB.run(`
        CREATE TRIGGER IF NOT EXISTS nim_msglog_ai AFTER INSERT ON nim_msglog 
        BEGIN 
          INSERT INTO nim_msglog_fts (
            rowid,idClient,text,sessionId,[from],time,target,[to],type,scene,idServer,fromNick,content
          ) VALUES (
            new.id,new.idClient,new.text,new.sessionId,new.[from],new.time,new.target,
            new.[to],new.type,new.scene,new.idServer,new.fromNick,new.content
          );
        END;`
      )
      this.logger.info('create table nim_msglog_ai success')
      await this.searchDB.run(`
        CREATE TRIGGER IF NOT EXISTS nim_msglog_ad AFTER DELETE ON nim_msglog
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
      this.logger.info('create table nim_msglog_ad success')
      await this.searchDB.run(`
        CREATE TRIGGER IF NOT EXISTS nim_msglog_au AFTER UPDATE ON nim_msglog
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
      this.logger.info('create table nim_msglog_au success')
      this.logger.info('create tables successfully')
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
      let msgs
      try {
        msgs = await new Promise((resolve, reject) => {
          super.getLocalMsgs({
            ...opt,
            done: (err: any, obj: any) => {
              if (err) {
                reject(err)
                return
              }
              resolve(
                obj.msgs && obj.msgs.filter(item => item.text && item.idClient)
                  .map(item => {
                    item.id = item.idClient
                    return item;
                  })
              )
            },
          })
        })
      } catch (err) {
        opt.done && opt.done(err, null)
      }

      // let msgs: any = obj.msgs
      const length = msgs.length
      const lastTime = length > 0 ? msgs[length - 1].time : undefined

      if (msgs && msgs.length > 0) {
        this.putFts(msgs || [], true)
      }

      // 解除引用
      msgs = null;

      opt.done && opt.done(null, {
        length,
        lastTime
      })
    }

    public async queryFts(params: IQueryParams): Promise<any> {
      try {
        // 入参过滤，去除多余的符号，text 替换 ' 字符
        if (params.text) {
          const reg = /[^\u4e00-\u9fa5^a-z^A-Z^0-9]/g
          params.text = params.text.replace(reg, ' ').trim()
        }
        if (!params.sessionIds) {
          params.sessionIds = []
        }
        if (!params.froms) {
          params.froms = []
        }

        // 如果 text 过滤后为空，并且此时不存在 froms，sessionIds，那么直接返回空把。
        if (!(params.text || params.froms.length > 0 ||
          params.sessionIds.length > 0 || params.start || params.end)) {
          return []
        }

        const sql = this._handleQueryParams(params)
        const records = await this.searchDB.all(sql)
        return records
      } catch (error) {
        this.logger.info('queryFts fail: ', error)
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

      // @ts-ignore
      msgs = null
      // 设置定时器，开始同步
      if (!this.timeout) {
        this.timeout = setTimeout(this._putFts.bind(this, isStock), 0)
      }
    }

    async _putFts(isStock = false): Promise<void> {
      // 当 msgQueue 为 null 或者 undefined 时，当作实例已经销毁，此定时触发的任务直接作废
      if (!this.msgQueue) {
        return
      }
      let msgs: any = isStock
        ? this.msgStockQueue.splice(0, 3000)
        : this.msgQueue.splice(0, 3000)

      // const { inserts, updates } = await this._getMsgsWithInsertAndUpdate(msgs)
      // let fts: any = await this._getMsgsWithInsertAndUpdate(msgs)
      let fts: any = msgs
      // 解除引用
      msgs = null
      const ftsLength = fts.length
      const ftsLastTime = fts[fts.length - 1].time
      

      if (fts.length > 0) {
        await this._doInsert(fts)
        // 解除引用
        fts = null
        // 当 msgQueue 为 null 或者 undefined 时，当作实例已经销毁，此定时触发的任务直接作废
        if (!this.msgQueue) {
          return
        }
        isStock
          ? this.emit(
            'ftsStockUpsert',
            ftsLength,
            this.msgQueue.length,
            this.msgStockQueue.length,
            ftsLastTime
          )
          : this.emit('ftsUpsert', ftsLength, this.msgQueue.length)
      }

      if (this.msgStockQueue.length === 0 && this.msgQueue.length === 0) {
        // clearTimeout(this.timeout)
        this.timeout = 0
        return
      }

      // 队列里还存在未同步的，那么继续定时执行
      this.timeout = this.msgStockQueue.length > 0 ?
        setTimeout(this._putFts.bind(this, true), 0) :
        setTimeout(this._putFts.bind(this), 0)
      

    }

    // async _getMsgsWithInsertAndUpdate(msgs: IMsg[]): Promise<IMsg[]> {
    //   // 去重
    //   // const map = msgs.reduce((total, next) => {
    //   //   if (next.idClient) {
    //   //     total[next.idClient] = next
    //   //   }
    //   //   return total
    //   // }, {})
    //   // msgs = Object.keys(map).map((key) => map[key])
    //   // const fts = msgs
    //   //   .filter((msg) => msg.text && msg.idClient)
    //   //   .map((msg) => {
    //   //     return {
    //   //       _id: msg.idClient,
    //   //       text: msg.text,
    //   //       sessionId: msg.sessionId,
    //   //       from: msg.from,
    //   //       time: msg.time,
    //   //       target: msg.target,
    //   //       to: msg.to,
    //   //       type: msg.type,
    //   //       scene: msg.scene,
    //   //       idServer: msg.idServer,
    //   //       fromNick: msg.fromNick,
    //   //       content: msg.content,
    //   //     }
    //   //   })
    //   let map: any = {}
    //   const fts: IMsg[] = [];
    //   msgs.forEach((msg: any) => {
    //     // text 内容存在，idClient 存在，在去重的 map 中找不到已经存在过的
    //     if (msg && msg.text && msg.idClient && !map[msg.idClient]) {
    //       fts.push({
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
    //       })
    //       map[msg.idClient] = true 
    //       Object.keys(msg).forEach((item: any) => { item = null })
    //       msg = null
    //     }
    //   })
    //   // 解除引用.
    //   map = null
    //   return fts
    // }

    async _doInsert(msgs: IMsg[]): Promise<void> {
      const that = this
      this.logger.info(`insert data to database, length: ${msgs.length}, timetag from ${msgs[0].time} to ${msgs[msgs.length - 1].time}`)
      return new Promise((resolve, reject) => {
        const column = tableColumn.map(() => '?').join(',')
        this.searchDB.serialize(() => {
          try {
            this.searchDB.exec('BEGIN TRANSACTION;')
            msgs.forEach((msg: any) => {
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
              .catch((err) => { that.emit('ftsError', err) })

              Object.keys(msg).forEach((item: any) => { item = null })
              msg = null
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
              that.logger.info('rollback: ', err)
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
        this.logger.info(`delete data from database, ids: ${idsString}`)
        await this.searchDB.run(`DELETE FROM nim_msglog WHERE idClient in (${idsString});`)
        this.logger.info('deleteFts success', ids)
      } catch (error) {
        this.logger.info('deleteFts fail: ', error)
        throw error
      }
    }

    public async clearAllFts(): Promise<void> {
      try {
        await this.searchDB.run('DELETE FROM `nim_msglog`;')
      } catch (error) {
        this.logger.info('clearAllFts fail: ', error)
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
        this.logger.info('dropAllFts success')
      } catch (error) {
        this.logger.info('dropAllFts fail: ', error)
        throw error
      }
    }

    public destroy(options): void {
      // 清空队列和定时器，关闭 db。
      this.timeout && clearTimeout(this.timeout)
      this.msgStockQueue = []
      this.msgQueue = []
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
          this.logger.info && this.logger.info('close searchDB success')
          FullTextNim.instance = null
          super.destroy(options)
        })
        .catch((error) => {
          this.logger.info && this.logger.info('close searchDB fail: ', error)
          FullTextNim.instance = null
          super.destroy(options)
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
      queryOption = this.queryOption,
    }: IQueryParams): string {
      const where: string[] = []
      if (text) {
        const matchRegex = new RegExp(/^[0-9a-zA-Z]+$/)
        const queryText = this.formatSQLText(text)
        if (matchRegex.test(text)) {
          where.push(
            `\`text\` GLOB '*${text}*'`
          )
        } else {
          where.push(
            `\`text\` MATCH query('${queryText}', ${queryOption}, ${this.enablePinyin})`
          )
        }
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
      this.logger.info('_handleQueryParams: ', sql)
      return sql
    }

    public static async getInstance(initOpt: IInitOpt): Promise<any> {
      if (!this.instance) {
        this.instance = new FullTextNim(initOpt)
        let error = null
        try {
          await this.instance.initDB()
          console.log(`Init DB successfully`)
        } catch (err) {
          console.error(`Failed to initialize database, error: ${err.message}`)
          error = err
        }
        // 如果 initdb 出错了，那么尝试从备份恢复，然后在重新打开 db，最后实在恢复不动则抛出错误给上层
        if (error) {
          try {
            await this.restoreDBFile()
            await this.instance.initDB()
          } catch (err: any) {
            this.logger.error(`Failed to initialize database, already try to restore db， error: ${err.message}`)
            throw err
          }
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
