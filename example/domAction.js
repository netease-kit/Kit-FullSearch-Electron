window.onload = (function () {
  const TAG_NAME = 'domAction.js'

  function $(id) {
    const funcName = id.startsWith('.')
      ? 'getElementByClassNames'
      : id.startsWith('#')
        ? 'getElementById'
        : undefined
    if (funcName) {
      return document[funcName](id.slice(1))
    }
    return undefined
  }

  function hasClass(target, className) {
    return target.className
      .split(/\s/)
      .filter((item) => !!item)
      .includes(className)
  }

  window.addEventListener('click', (e) => {
    const target = e.target
    // 写入数据
    if (hasClass(target, 'j-write')) {
      const $keyword = $('#w-keyword')
      const $number = $('#w-number')
      const text = $keyword.value || undefined
      const number = $number.value
      if (!number) {
        console.log('请输入写入的条数')
        return
      }
      if (window.test) {
        window.test.writeData(number, text)
        console.log('写入指令调用成功')
      }
    }
    // 全文搜索
    else if (hasClass(target, 'j-query-fulltext')) {
      const text = $('#q-keyword').value
      const limit = $('#q-limit').value || undefined
      const offset = $('#q-offset').value || undefined
      const sessionIds = $('#q-sessionIds').value || undefined
      const froms = $('#q-froms').value || undefined
      const sort = $('#q-sort').value || undefined
      const queryOption = $('#q-option').value || 0
      let start = $('#q-start').value
      let end = $('#q-end').value
      // if (!text && !sessionIds && !froms) {
      //   console.log('请输入查询的 关键字 或 sessionId 或 froms')
      //   return
      // }
      start = start
        ? start.includes('-')
          ? new Date(start).getTime()
          : start * 1
        : undefined
      end = end
        ? end.includes('-')
          ? new Date(end).getTime()
          : end * 1
        : undefined
      if (window.nim) {
        const _start = performance.now()
        window.nim
          .queryFts({
            text,
            sessionIds: sessionIds ? sessionIds.split(',') : [],
            froms: froms ? froms.split(',') : [],
            limit,
            offset,
            timeDirection: sort,
            start,
            end,
            queryOption
          })
          .then((res) => {
            const _end = performance.now()
            console.log(TAG_NAME, `查询成功，耗时: ${_end - _start} ms`, res)
          })
          .catch((err) => {
            console.error(TAG_NAME, '查询失败：', err)
          })
      }
    }
    // 根据idClient查询
    else if (hasClass(target, 'j-query-indexdb')) {
      const value = $('#q-idClient').value
      if (!value) {
        console.log('请输入要查询的idClient')
        return
      }
      if (window.test) {
        window.test.readByPrimary(value)
        // console.log('查询成功')
      }
    }
    // 发送
    else if (hasClass(target, 'j-send')) {
      const $keyword = $('#s-keyword')
      const value = $keyword.value
      if (!value) {
        console.log('请输入要发送的消息内容')
        return
      }
      window.nim &&
        window.nim.sendText({
          scene: 'p2p',
          to: 'cs2',
          text: value,
          done(err, obj) {
            if (err) return
            // 发送失败的时候可能无 idClient
            if (!obj.idClient) return
            console.log('发送成功')
          },
        })
    }
    // 清空
    else if (hasClass(target, 'j-clear')) {
      window.nim &&
        window.nim
          .clearAllFts()
          .then(() => {
            console.log('清空成功')
          })
          .catch(() => {
            console.log('清空失败！')
          })
    } else if (hasClass(target, 'j-drop')) {
      window.nim && window.nim.dropAllFts()
        .then(() => {
          console.log('删除所有表并重建成功')
        })
        .catch(() => {
          console.log('操作失败！')
        })
    }
    // 同步消息
    else if (hasClass(target, 'j-sync')) {
      if (window.nim && window.nim.getLocalMsgsToFts) {
        window.total = 0;
        doSyncByLimit();
      } else {
        console.error('无数据库')
      }
    }
    else if (hasClass(target, 'j-syncall')) {
      if (window.nim && window.nim.getLocalMsgsToFts) {
        window.total = 0;
        doSyncAll();
      } else {
        console.error('无数据库')
      }
    }
    else if (hasClass(target, 'j-write-indexdb')) {
      window.test.writeDataInIndexDB(50000)
    }
    else if (hasClass(target, 'j-write-indexdb-ascii')) {
      let txt = ''
      for (let j = 0; j < 127; j++) {
        txt += String.fromCodePoint(j)
      }
      window.test.writeDataInIndexDB(1, txt)
    }
  })
})()

function doSyncByLimit(start = 0) {
  window.nim.getLocalMsgsToFts({
    start: start, // 起点
    end: new Date().getTime(), // 终点
    desc: false, // 从start开始查
    types: ['text', 'custom'], // 只针对文本消息和自定义消息
    limit: 3000,
    // limit: 10,
    done(error, obj) {
      if (obj.msgs && obj.msgs.length > 0) {
        console.log('从 indexdb 里取出了一批 ', obj.msgs.length)
        window.total += obj.msgs.length;
        const time = obj.msgs[obj.msgs.length - 1].time
        doSyncByLimit(time)
      }
    },
  })
}

// function doSyncByLimit(start = 0) {
//   if (start === 0) {
//     window.nim.on('ftsStockUpsert', function (excuteRow, otherRow, restRow, lastTime) {
//       // console.log('同步进度：', 100 - restRow / window.total * 100)
//       console.log(`upsert 存量数据任务进行中，已执行 ${excuteRow} 条, 另外一个消息队列目前拥有 ${otherRow} 条, 存量数据队列还剩下 ${restRow} 条, 上一条同步的时间是 ${lastTime} `)
//       lastTime > 0 ? doSyncByLimit(lastTime) : null
//     })
//   }
//   window.nim.getLocalMsgsToFts({
//     start: start, // 起点
//     end: new Date().getTime(), // 终点
//     desc: false, // 从start开始查
//     types: ['text', 'custom'], // 只针对文本消息和自定义消息
//     limit: 3000,
//     // limit: 10,
//     done(error, obj) {
//     },
//   })
// }

function doSyncAll(end = new Date().getTime()) {
  window.nim.getLocalMsgsToFts({
    start: 0, // 起点
    end: 1640995200000, // 终点
    desc: false, // 从start开始查
    types: ['text', 'custom'], // 只针对文本消息和自定义消息
    limit: Infinity,
    done(error, obj) {
      if (obj.msgs && obj.msgs.length > 0) {
        window.total += obj.msgs.length;
      }
    },
  })
}

