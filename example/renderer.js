const fullText = require('kit-fullsearch-electron').default
const SDK = require('./sdk/NIM_Web_SDK_v8.5.1_test')
const Test = require('./test')
const NIM = fullText(SDK.NIM)
const TAG_NAME = 'renderer.js'

function doLog(err, obj) {
  console.log(TAG_NAME, 'receive: ', err, obj)
}

NIM.getInstance({
  debug: true,
  appKey: 'fe416640c8e8a72734219e1847ad2547',
  account: 'cs6',
  token: 'e10adc3949ba59abbe56e057f20f883e',
  queryOption: 1,
  enablePinyin: false,
  // db: form.db,
  // syncSessionUnread: form.syncSessionUnread,
  // autoMarkRead: form.syncSessionUnread,
  reconnectionDelay: 1000, // 在第一次尝试重连之前最初等待多长时间
  reconnectionDelayMax: 60000, // 重新连接之间等待的最大时间
  reconnectionJitter: 0, // 重连等待时间振荡值
  searchDBPath: process.env.HOME,

  // 自定义分词函数
  // fullSearchCutFunc: (text) => {
  //   return nodejieba.cut(text)
  // },

  onconnect(obj) {
    console.log(TAG_NAME, '连接建立成功', obj)
    window.test = new Test()
    // if (loginInfo) {
    // 连接上以后更新uid
    // commit('updateUserUID', loginInfo)
    // }
  },
  onerror() {
    // alert(JSON.stringify(event))
    // debugger
    console.error(TAG_NAME, 'error')
    // location.href = config.loginUrl
  },
  onwillreconnect(obj) {
    console.log(TAG_NAME, obj)
  },
  ondisconnect: function onDisconnect(error) {
    let map = {
      PC: '电脑版',
      Web: '网页版',
      Android: '手机版',
      iOS: '手机版',
      WindowsPhone: '手机版',
    }
    let str = error.from
    let errorMsg = `你的帐号于${new Date()}被${map[str] || '其他端'
      }踢出下线，请确定帐号信息安全!`
    switch (error.code) {
      // 账号或者密码错误, 请跳转到登录页面并提示错误
      case 302:
        console.log(TAG_NAME, '帐号或密码错误')
        break
      // 被踢, 请提示错误后跳转到登录页面
      case 'kicked':
        console.log(TAG_NAME, '被踢')
        break
      default:
        console.error(TAG_NAME, error)
        break
    }
  },

  /* 关系（静默，黑名单）及好友，同步及更新 */
  onfriends: doLog,
  onsyncfriendaction: doLog,
  // onmutelist: doLog,
  // onsyncmarkinmutelist: doLog,
  onblacklist: doLog,
  onsyncmarkinblacklist: doLog,

  /* 用户信息/名片，同步及更新 */
  onmyinfo: doLog,
  onupdatemyinfo: doLog,
  onusers: doLog,
  onupdateuser: doLog,

  /* 群组信息，同步及更新 */
  onteams: doLog,
  onsynccreateteam: doLog,
  onteammembers: doLog,
  onCreateTeam: doLog,
  onDismissTeam: doLog,
  onUpdateTeam: doLog,
  onAddTeamMembers: doLog,
  onRemoveTeamMembers: doLog,
  onUpdateTeamManagers: doLog,
  onupdateteammember: doLog,
  onUpdateTeamMembersMute: doLog,
  onTeamMsgReceipt: doLog,

  /* 超级群，同步及更新 */
  onSuperTeams: doLog,
  onSyncCreateSuperTeam: doLog,
  onUpdateSuperTeam: doLog,
  onUpdateSuperTeamMember: doLog,
  onAddSuperTeamMembers: doLog,
  onRemoveSuperTeamMembers: doLog,
  onDismissSuperTeam: doLog,
  // onTransferSuperTeam: doLog,
  onUpdateSuperTeamMembersMute: doLog,

  /* 会话 */
  onsessions: doLog,
  onupdatesession: doLog,

  /* 消息 */
  /* 已下三个函数会自动同步到searchDB */
  onroamingmsgs: function (obj) { },
  onofflinemsgs: function (obj) { },
  onmsg: function (obj) { },

  /* 系统通知 */
  onsysmsg: doLog,
  onofflinesysmsgs: doLog,
  onupdatesysmsg: doLog,
  onsysmsgunread: doLog,
  onupdatesysmsgunread: doLog,
  onofflinecustomsysmsgs: doLog,
  oncustomsysmsg: doLog,

  onStickTopSessions: function (session) {
    console.log(TAG_NAME, '收到置顶会话列表', session)
  },

  /* 同步完成 */
  onsyncdone: function onSyncDone() {
    // store.commit('setLoading', false)
    console.log(TAG_NAME, 'onsyncdone')
  },
}).then((nim) => {
  console.log('then?')
  window.nim = nim
})
