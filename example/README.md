# kit-fullsearch-electron 使用示例

## 安装

```bash
$ npm install
```

## 启动

```bash
$ npm start
```

## 打包

electron-packager

```
npx electron-packager .
```

electron-builder

使用 electron-builder 打包前请确认 package.json 中将 `kit-fullsearch-electron` 包从 asar 列表中排除，否则可能无法正常加载三方模块，如下示例：

```json
"build": {
    "asar": true,
    "asarUnpack": [
        "node_modules/kit-fullsearch-electron"
    ]
},
```

确认无误后使用如下命令进行打包

```bash
npx electron-builder
```

## Mock & 测试

启动后，示例提供了 `nim实例` 和 `test实例`，可以通过 `window` 快速进行访问。

其中，`test实例` 提供了以下方法方便快速进行测试

- `readByPrimary` 根据 id 从 indexDB 中查询
- `readByKeyword` 根据关键字从 searchDB 中查询
- `writeData` 写入数据
- `printUseSize` 打印占用空间
