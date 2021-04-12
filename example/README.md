# kit-fullsearch-electron 使用示例

## 安装

```bash
$ npm install
```

## 启动

```bash
$ npm start
```

## Mock & 测试

启动后，示例提供了 `nim实例` 和 `test实例`，可以通过 `window` 快速进行访问。

其中，`test实例` 提供了以下方法方便快速进行测试

- `readByPrimary` 根据 id 从 indexDB 中查询
- `readByKeyword` 根据关键字从 searchDB 中查询
- `writeData` 写入数据
- `printUseSize` 打印占用空间
