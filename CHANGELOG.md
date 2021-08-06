## 2.1.2

### 优化

* 含有字母、数字搜索条件的精准度
* 捕获部分场景 SQL 语句执行异常

## 2.1.0

* 修复由于插入特殊字符到 sqlite 导致 error，上层没有捕获让进程退出的 bug。
* 优化插入速度，并做了队列去插入，putFts 更改为非异步接口，调用只是将 msg 塞入队列排队。
* 插入去重，更新建表结构，保证入库记录不重复。
* 稳定性保证 & 追加事件：ftsDamaged，ftsError，ftsUpsert，ftsStockUpsert

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

* putFts 的 text 过滤特殊字符，允许传空搜索，特殊字符会被视作空格处理.
* 搜索文本匹配规则升级