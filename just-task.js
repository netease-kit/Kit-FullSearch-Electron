const { task, option, logger, argv } = require('just-scripts')
const fs = require('fs')
const download = require('download')
const path = require('path')
const downloadUrl = 'http://yx-web.nos.netease.com/package/electron-tokenizer-plugin.tar.gz'
task('install', () => {
  return new Promise((resolve, reject) => {
    const localPath = path.join(__dirname, 'lib')
    download(downloadUrl, localPath, {
      extract: true
    }).then(() => {
      logger.info(`[install] Download prebuilt binaries from ${downloadUrl}`)
      if (process.platform === 'win32') {
        const src = path.join(localPath, process.arch, 'simple.dll')
        const dst = path.join(localPath, 'simple.dll')
        logger.info(`Copy win32 lib from ${src} to ${dst}`)
        fs.copyFileSync(src, dst)
      }
      resolve()
    }).catch(err => {
      logger.warn(`[install] Failed to download package from: ${downloadUrl}`)
      reject()
    })
  })
})
