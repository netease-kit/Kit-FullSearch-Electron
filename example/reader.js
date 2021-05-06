// 执行 node reader.js 查看search-index存储内容
var levelup = require('levelup')
var leveldown = require('leveldown')

// 1) Create our store
var db = levelup(
  leveldown('./NIM-FULLTEXT-SEARCHDB-cs6-fe416640c8e8a72734219e1847ad2547')
)

db
  .createReadStream
  // {
  //   gte: 'idx' + ':' + '车' + '#',
  //   lte: 'idx' + ':' + '车' + '#' + '￮',
  // }
  ()
  .on('data', function (data) {
    console.log(data.key.toString(), '=', data.value.toString())
  })
  .on('error', function (err) {
    console.log('Oh my!', err)
  })
  .on('close', function () {
    console.log('Stream closed')
  })
  .on('end', function () {
    console.log('Stream ended')
  })
