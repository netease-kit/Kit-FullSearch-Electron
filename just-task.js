const { task, option, logger, argv } = require('just-scripts')
const fs = require('fs')
const download = require('download')
const path = require('path')

const downloadUrl = 'http://yx-web.nos.netease.com/package/electron-tokenizer-plugin.tar.gz'

task('install', () => {
    return new Promise((resolve, reject) => {
        download(downloadUrl, path.join(__dirname, 'lib'), {
            extract: true
        }).then(() => {
            logger.info(`[install] Download prebuilt binaries from ${downloadUrl}`)
            resolve()
        }).catch(err => {
            logger.warn(`[install] Failed to download package from: ${downloadUrl}`)
            reject()
        })
    })
})
  