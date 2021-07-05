# Kit-FullSearch-Electron

全文搜索组件，基于网易云信 web 端 im sdk，用于 Electron

## 安装

前置依赖

```bash
$ npm install --save kit-fullsearch-electron sqlite3
```

采用 sqlite fts5 extension，默认的 sqlite3 并不支持中文分词，故而使用者需要把编译好的 /example/tokenizer 分词文件夹放入主工程根目录下。

## 使用

```js
const fullText = require('kit-fullsearch-electron').default

// 引入网易云信im sdk
const SDK = require('./sdk/NIM_Web_SDK_v8.3.0_test')

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

测试发现在 electron 调试页面连续刷新可能会导致这个 then 没有被触发，因为加载 dll 似乎在调试阶段有点毛病。。

组件扩展了以下 nim 的方法，会自动将数据分词后同步到本地的 searchDB。使用组件后，新消息组件会自动同步到 searchDB，历史消息需要通过使用者主动调用 `nim.getLocalMsgsToFts` 来同步到 searchDB 中。

- `onroamingmsgs`
- `onofflinemsgs`
- `onmsg`
- `sendText`
- `sendCustomMsg`
- `saveMsgsToLocal`
- `deleteMsg`
- `deleteLocalMsg`
- `deleteAllLocalMsgs`
- `deleteMsgSelf`
- `deleteMsgSelfBatch`

请使用者按需使用。关于以上 API 的详细介绍，可以查看 nim[官方文档](https://dev.yunxin.163.com/docs/interface/%E5%8D%B3%E6%97%B6%E9%80%9A%E8%AE%AFWeb%E7%AB%AF/NIMSDK-Web/NIM.html)

### 新增初始化参数

以下方法为新增的初始化参数，可以用于在调用 `NIM.getInstance` 时传入

- `searchDBName?: string` 本地 searchDB 的 name，用于初始化不同的 searchDB，有默认前缀 `NIM-FULLTEXT-SEARCHDB-`，后缀不传则使用 account 加 appKey 的组合
- `searchDBPath?: string` 本地 searchDB 的存储目录，默认项目目录
- `ftLogFunc?: (...args: any) => void` 日志方法，不传使用内置的日志方法

### 新增实例方法

**另外，经过扩展后的 nim 实例上，新增了以下方法**

#### getLocalMsgsToFts(opt): void

调用 nim 的 getLocalMsgs 查询历史消息，并将数据存入本地 searchDB。参数同 nim.getLocalMsgs。

```js
nim.getLocalMsgsToFts({
  ...opt,
  done(err, obj) {
    if (!err) {
      console.log('查询并同步本地消息成功')
    }
  },
})
```

如果本地数据量较大，参考 example 下的办法

```js
function doSyncOneYear(order = 0) {
  if (order === 12) {
    return;
  }
  const aYearAgo = new Date().getTime() - 31536000000;
  const aMonth = 2592000000;
  const start = aYearAgo + (order * aMonth)
  const end = start + aMonth
  console.time('getLocalMsgsToFts')
  window.nim.getLocalMsgsToFts({
    start: start, // 起点
    end: end, // 终点
    desc: false, // 从start开始查
    types: ['text', 'custom'], // 只针对文本消息和自定义消息
    limit: Infinity,
    done(error, obj) {
      console.log(
        '获取并同步本地消息' + (!error ? '成功' : '失败'),
        error,
        '开始时间 ' + new Date(start),
        '结束时间 ' + new Date(end),
        '共 ' + obj.msgs && obj.msgs.length + ' 条'
      )
      console.timeEnd('getLocalMsgsToFts')
      doSyncOneYear(order + 1)
    },
  })
}
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

#### putFts(msgs: Msg | Msg[]): Promise<void>

新增以及修改 db 中的数据

```js
nim
  .putFts(msg)
  .then((res) => {
    console.log('修改成功: ', res)
  })
  .catch((err) => {
    console.error('修改失败: ', err)
  })
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

## 示例

示例可以查看 `/example` 文件夹下的内容，[点击这里](example/README.md)进行快速跳转
