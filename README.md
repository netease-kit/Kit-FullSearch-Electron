# Kit-FullSearch-Electron

全文搜索组件，基于网易云信 web 端 im sdk，用于 Electron

## 安装

```bash
$ npm install kit-fullsearch-electron nodejieba search-index -S
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

组件扩展了以下 nim 的方法，会自动将数据分词后同步到本地的 searchDB

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
- `getLocalMsgs`

请使用者按需使用。关于以上 API 的详细介绍，可以查看 nim[官方文档](https://dev.yunxin.163.com/docs/interface/%E5%8D%B3%E6%97%B6%E9%80%9A%E8%AE%AFWeb%E7%AB%AF/NIMSDK-Web/NIM.html)

### 新增初始化参数

以下方法为新增的初始化参数，可以用于在调用 `NIM.getInstance` 时传入

- `ignoreChars?: string` 需要过滤掉的无意义的词，不传使用内置的过滤词
- `searchDBName?: string` 本地 searchDB 的 name，用于初始化不同的 searchDB，有默认前缀 `NIM-FULLTEXT-SEARCHDB-`，后缀不传则使用 account 加 appKey 的组合
- `logFunc?: (...args: any) => void` 日志方法，不传使用内置的日志方法

### 新增实例方法

**另外，经过扩展后的 nim 实例上，新增了以下方法**

#### queryFts(text: string, limit?: number): Promise<any> 根据关键字进行全文检索，返回查询的结果

```js
nim
  .queryFts('hello', 100)
  .then((res) => {
    console.log('查询成功: ', res)
  })
  .catch((err) => {
    console.error('查询失败: ', err)
  })
```

#### putFts(msgs: Msg | Msg[]): Promise<void> 新增以及修改 searchDB 中的数据

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

#### deleteFts(ids: string | string[]): Promise<void> 根据 idClient 删除 searchDB 中的数据

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

#### clearAllFts(): Promise<void> 清楚所有 searchDB 中的数据

```js
nim
  .clearAllFts(_ids)
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

- [nodejieba](https://github.com/yanyiwu/nodejieba)
- [search-index](https://github.com/fergiemcdowall/search-index)
