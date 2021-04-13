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
        alert('请输入写入的条数')
        return
      }
      if (window.test) {
        window.test.writeData(number, text)
        alert('写入成功')
      }
    }
    // 全文搜索
    else if (hasClass(target, 'j-query-fulltext')) {
      const $keyword = $('#q-keyword')
      const $number = $('#q-number')
      const text = $keyword.value
      const number = $number.value || undefined
      if (!text) {
        alert('请输入查询的关键字')
        return
      }
      if (window.nim) {
        const start = performance.now()
        window.nim
          .queryFts(text, number)
          .then((res) => {
            const end = performance.now()
            console.log(TAG_NAME, `查询成功，耗时: ${end - start} ms`, res)
            alert(`查询成功，耗时: ${end - start} ms`)
          })
          .catch((err) => {
            console.error(TAG_NAME, '查询失败：', err)
            alert('查询失败')
          })
      }
    }
    // 根据idClient查询
    else if (hasClass(target, 'j-query-indexdb')) {
      const value = $('#q-idClient').value
      if (!value) {
        alert('请输入要查询的idClient')
        return
      }
      if (window.test) {
        window.test.readByPrimary(value)
        // alert('查询成功')
      }
    }
    // 发送
    else if (hasClass(target, 'j-send')) {
      const $keyword = $('#s-keyword')
      const value = $keyword.value
      if (!value) {
        alert('请输入要发送的消息内容')
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
            alert('发送成功')
          },
        })
    }
    // 清空
    else if (hasClass(target, 'j-clear')) {
      window.nim &&
        window.nim
          .clearAllFts()
          .then(() => {
            alert('清空成功')
          })
          .catch(() => {
            alert('清空失败！')
          })
    }
  })
})()
