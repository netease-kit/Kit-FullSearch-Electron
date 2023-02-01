
# 环境变量 RM_MODULES 表示要移除的、不被打包的IM模块，如msg、team等，以下划线分隔
# 模块名列表见 src/service.ts 中的 ServiceName

publish_npm:
	npx npm run build
	npm publish --registry https://registry.npmjs.org/
	open https://npm.taobao.org/sync/kit-fullsearch-electron
	echo "Please visit https://www.npmjs.com/package/kit-fullsearch-electron"