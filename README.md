# Kit-FullSearch-Electron

全文搜索组件，基于网易云信 web 端 im sdk，用于 Electron

## 安装

前置依赖

```bash
$ npm install --save kit-fullsearch-electron sqlite3
```

采用 sqlite fts5 extension，默认的 sqlite3 并不支持中文分词，npm install 的过程会下载一个中文分词的 dll。

## 使用

```js
const fullText = require('kit-fullsearch-electron').default

// 引入网易云信im sdk
const SDK = require('./sdk/NIM_Web_SDK_v8.5.0')

// 使用组件扩展sdk，以支持全文搜索功能
const NIM = fullText(SDK.NIM)

// 接下来，正常使用NIM
// 需要注意，扩展后的NIM的getInstance方法变为了异步
NIM.getInstance({
  // ...
}).then((nim) => {
  window.nim = nim
})
```

测试发现在 electron 调试页面连续刷新可能会导致这个 then 没有被触发，因为加载 dll 似乎在调试阶段有点毛病。

组件扩展了以下 nim 的方法，会自动将数据分词后同步到本地的 searchDB。使用组件后，新消息组件会自动同步到 searchDB，历史消息需要通过使用者主动调用 `nim.getLocalMsgsToFts` 来同步到 searchDB 中。

拦截初始化回调

- `onroamingmsgs`
- `onofflinemsgs`
- `onofflinesysmsgs`
- `onsysmsg`
- `onmsg`
- `onDeleteMsgSelf`

拦截 API

- `sendText`
- `sendCustomMsg`
- `saveMsgsToLocal`
- `deleteMsg`
- `deleteLocalMsg`
- `deleteAllLocalMsgs`
- `deleteMsgSelf`
- `deleteMsgSelfBatch`
- `destroy`

请使用者按需使用。关于以上 API 的详细介绍，可以查看 nim[官方文档](https://dev.yunxin.163.com/docs/interface/%E5%8D%B3%E6%97%B6%E9%80%9A%E8%AE%AFWeb%E7%AB%AF/NIMSDK-Web/NIM.html)

### 新增初始化参数

以下方法为新增的初始化参数，可以用于在调用 `NIM.getInstance` 时传入

- `searchDBName?: string` 本地 searchDB 的 name，用于初始化不同的 searchDB，有默认前缀 `NIM-FULLTEXT-SEARCHDB-`，后缀不传则使用 account 加 appKey 的组合
- `searchDBPath?: string` 本地 searchDB 的存储目录，默认项目目录
- `ftLogFunc?: (...args: any) => void` 日志方法，不传使用内置的日志方法

### 新增实例方法

**另外，经过扩展后的 nim 实例上，新增了以下方法**

#### getLocalMsgsToFts(opt): void

调用 nim 的 getLocalMsgs 查询历史消息，并将数据存入本地 sqlite 中。参数同 nim.getLocalMsgs。

在 2.1.0 里做了修改，任务会进入一个队列之中，开发者需要监听事件来获知进度

```js
nim.getLocalMsgsToFts({
  ...opt,
  done(err, obj) {
    if (!err) {
      console.log('查询并同步本地消息成功')
    }
  },
})

nim.on('ftsStockUpsert', function (excuteRow, otherRow, restRow, lastTime) {
  console.log('同步进度：', 100 - restRow / window.total * 100)
  console.log(`upsert 存量数据任务进行中，已执行 ${excuteRow} 条, 另外一个消息队列目前拥有 ${otherRow} 条, 存量数据队列还剩下 ${restRow} 条, 上一条同步的时间是 ${lastTime} `)
})
```
#### queryFts(params: IQueryParams): Promise<any>

参数说明

```typescript
type IDirection = 'ascend' | 'descend'


interface IQueryParams {
  text: string // 搜索关键字
  limit?: number // 查询条数，默认100
  sessionIds?: string[] // 查询的sessionId数组
  froms?: string[] // 查询的发送人from的数组
  timeDirection?: IDirection // 查询结果是否根据时间排序，不传按照默认打分排序
  start?: number // 开始查询的起点时间戳
  end?: number // 开始查询的终点时间戳
}
```

根据关键字进行全文检索，返回查询的结果

```js
nim
  .queryFts({
    text: 'hello',
    limit: 100,
  })
  .then((res) => {
    console.log('查询成功: ', res)
  })
  .catch((err) => {
    console.error('查询失败: ', err)
  })
```

#### putFts(msgs: Msg | Msg[]): void

新增以及修改 db 中的数据，会进入队列中.

```js
nim.putFts(msg)
```

#### deleteFts(ids: string | string[]): Promise<void>

根据 idClient 删除 db 中的数据

```js
nim
  .deleteFts(ids)
  .then((res) => {
    console.log('删除成功: ', res)
  })
  .catch((err) => {
    console.error('删除失败: ', err)
  })
```

#### clearAllFts(): Promise<void>

清除所有 db 中的数据

```js
nim
  .clearAllFts()
  .then((res) => {
    console.log('清空成功: ', res)
  })
  .catch((err) => {
    console.error('清空失败: ', err)
  })
```

#### dropAllFts(): Promise<void>

删除所有表，并重建表结构

```js
nim
  .clearAllFts()
  .then((res) => {
    console.log('清空成功: ', res)
  })
  .catch((err) => {
    console.error('清空失败: ', err)
  })
```

### 新增事件

```js
// 数据库损毁事件，初始化时会异步检查一遍数据库，若发现数据库损毁会报这个错误
nim.on('ftsDamaged', function (err) {
  console.log('数据库已经损毁，请调用 rebuildDbIndex 修复', err)
  // 调用此 API 尝试性修复
  nim.rebuildDbIndex()
})
// sql 语句执行出错，上报此事件
nim.on('ftsError', function (err) {
  console.log('sql 执行出错', err)
})

// 一般队列执行完一批，上报此事件
nim.on('ftsUpsert', function (excuteRow, restRow) {
  console.log('upsert 进行中，已执行 ', excuteRow, ' 还剩下 ', restRow)
})
// 特化的 getLocalMsgsToFts API 所创建的队列，每执行完一批，上报此事件
nim.on('ftsStockUpsert', function (excuteRow, otherRow, restRow, lastTime) {
  console.log('同步进度：', 100 - restRow / window.total * 100)
  console.log(`upsert 存量数据任务进行中，已执行 ${excuteRow} 条, 另外一个消息队列目前拥有 ${otherRow} 条, 存量数据队列还剩下 ${restRow} 条, 上一条同步的时间是 ${lastTime} `)
})
```

## 示例

示例可以查看 `/example` 文件夹下的内容，[点击这里](example/README.md)进行快速跳转
