const { task, option, logger, argv } = require('just-scripts')
const fs = require('fs')
const download = require('download')
const path = require('path')

task('install', () => {
  return new Promise((resolve, reject) => {
    const curPkgMeta = require(path.join(__dirname, 'package.json'))
    const localPath = path.join(__dirname, 'lib')
    const downloadUrl = `http://yx-web.nos.netease.com/package/electron-tokenizer-plugin_v${curPkgMeta.version}.tar.gz`
    download(downloadUrl, localPath, {
      extract: true
    }).then(() => {
      const platform = process.env.npm_config_target_platform || process.platform
      const arch = process.env.npm_config_target_arch || process.arch
      logger.info(`[install] Download prebuilt binaries from ${downloadUrl}`)
      logger.info(`[install] Target platform: ${platform}`)
      logger.info(`[install] Target arch: ${arch}`)
      if (platform === 'win32') {
        const src = path.join(localPath, arch, 'simple.dll')
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
