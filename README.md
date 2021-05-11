# Kit-FullSearch-Electron

全文搜索组件，基于网易云信 web 端 im sdk，用于 Electron

## 安装

```bash
$ npm install kit-fullsearch-electron search-index -S
```

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

- `ignoreChars?: string` 需要过滤掉的无意义的词，不传使用内置的过滤词
- `searchDBName?: string` 本地 searchDB 的 name，用于初始化不同的 searchDB，有默认前缀 `NIM-FULLTEXT-SEARCHDB-`，后缀不传则使用 account 加 appKey 的组合
- `searchDBPath?: string` 本地 searchDB 的存储目录，默认项目目录
- `ftLogFunc?: (...args: any) => void` 日志方法，不传使用内置的日志方法
- `fullSearchCutFunc?: (text: string) => string[]` 自定义分词方法，不传使用默认内置的分词方法

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

如果本地数据量较大，一次性同步所有数据并存入 searchDB 可能会导致性能问题。因此，在这种场景下，建议使用者自行控制调用该方法的时机。
以下是一个递归调用的例子

```js
const handler = (start, end) => {
  if (start < Date.now()) {
    nim.getLocalMsgsToFts({
      start, // 起点
      end, // 终点
      desc: false, // 从start开始查
      types: ['text', 'custom'], // 只针对文本消息和自定义消息
      done: getLocalMsgsToFtsDone,
    })

    function getLocalMsgsToFtsDone(error, obj) {
      console.log('获取并同步本地消息' + (!error ? '成功' : '失败'), error, obj)
      if (!error) {
        const newStart = end + 24 * 60 * 60 * 1000 // 取上一次执行结束的时间的后一天作为新一轮查询的起点
        const newEnd = newStart + 7 * 24 * 60 * 60 * 1000 // 取下一轮7天内的数据
        handler(newStart, newEnd)
      }
    }
  }
}

// 从30天前开始查，每次查询7天
const start = Date.now() - 30 * 24 * 60 * 60 * 1000
const end = start + 7 * 24 * 60 * 60 * 1000
handler(start, end)
```

#### queryFts(params: IQueryParams): Promise<any>

参数说明

```typescript
type IDirection = 'ascend' | 'descend'

type ILogic = 'and' | 'or'

interface IQueryParams {
  text: string // 搜索关键字
  limit?: number // 查询条数，默认100
  sessionIds?: string[] // 查询的sessionId数组
  froms?: string[] // 查询的发送人from的数组
  timeDirection?: IDirection // 查询结果是否根据时间排序，不传按照默认打分排序
  start?: number // 开始查询的起点时间戳
  end?: number // 开始查询的终点时间戳
  textLogic?: ILogic // 关键字分词后的查询逻辑，默认and
  sessionIdLogic?: ILogic // 多个sessionId的查询逻辑，默认or
  fromsLogic?: ILogic // 多个froms的查询逻辑，默认or
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

新增以及修改 searchDB 中的数据

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

根据 idClient 删除 searchDB 中的数据

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

清除所有 searchDB 中的数据

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

## 相关库参考

- [search-index](https://github.com/fergiemcdowall/search-index)
