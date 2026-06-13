# Octo 微博相册批量下载

一个用于批量下载微博用户相册图片的 Chrome 扩展。当前版本已迁移到 Manifest V3，并适配新版微博相册接口与图片防盗链下载。

## 功能

- 读取当前微博页面对应用户的相册列表
- 支持从 `weibo.com/u/{uid}` 与 `photo.weibo.com/{uid}/albums` 页面识别用户
- 支持从列表页识别多个用户，并切换下载对象
- 批量下载单个相册图片，按“用户昵称_相册名”创建下载目录
- 支持下载比例选择，例如 100%、50%、10%
- 支持下载并发数设置
- 支持暂停、继续、停止下载队列，停止按钮会随下载状态自动启用或置灰
- 图片文件名尽量保持微博原始图片名
- 处理 `sinaimg.cn` / `sinajs.cn` 图片防盗链，避免下载成 HTML 文件
- 下载进度显示“已成功下载数量 / 相册总数量”

## 安装

1. 打开 Chrome 扩展管理页：`chrome://extensions/`
2. 开启右上角“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择本项目目录
5. 确保已经在 Chrome 中登录微博

建议关闭 Chrome 的“下载前询问每个文件的保存位置”，否则批量下载时会不断弹出保存确认。

## 使用

1. 打开微博用户主页或微相册页面，例如 `https://weibo.com/u/{uid}`、`https://photo.weibo.com/{uid}/albums`
2. 点击浏览器右上角的扩展图标
3. 等待相册列表加载完成
4. 可按需调整下载比例、并发数量、完成后是否打开文件夹
5. 点击相册卡片开始下载

下载目录默认位于 Chrome 下载目录下：

```text
WeiboAlbum/用户昵称_相册名/
```

## 当前接口策略

新版微博部分接口会对某些 UID 返回 `Forbidden`。当前扩展只使用 `photo.weibo.com` 相册接口：

- `https://photo.weibo.com/albums/get_all`
- `https://photo.weibo.com/photos/get_all`

已避免依赖下列容易失效或被拦截的接口：

- `https://weibo.com/ajax/profile/info`
- `https://weibo.com/ajax/profile/getAlbumDetail`
- `https://weibo.com/ajax/profile/getImageWall`

弹窗顶部“当前用户”会跳转到标准微相册地址：

```text
https://photo.weibo.com/{uid}/albums
```

## 常见问题

### 点击下载后没有文件

确认微博登录状态仍然有效，并检查扩展详情页是否已经授予微博和新浪图片域名权限。

### 下载成 HTML 文件

通常是图片防盗链导致。当前版本会先以微博来源请求图片 Blob，再通过 Chrome 下载 API 保存。如果仍出现该问题，可以在扩展后台控制台查看 `[download:fetch:error]` 日志。

### 并发下载时文件名变成“下载.jpeg”

扩展会在 Blob 下载阶段记录下载任务和原始文件名的对应关系，再通过 Chrome 下载命名回调恢复为微博原图文件名。若看到 `[download:filename:missing]` 日志，说明 Chrome 没有把该任务关联回扩展记录，可保留日志继续排查。

### 文件夹名称不是目标用户

扩展会优先从当前页面 URL、相册接口返回数据和页面标题中识别目标用户。如果微博页面结构变更，可能需要重新适配用户昵称提取逻辑。

### 进度总数显示不正确

扩展会优先使用相册列表返回的图片总数，并在下载分页接口返回新总数时更新。若微博接口本身不返回总数，会退回使用已处理数量。

## 开发

本项目不需要构建步骤，直接以解压扩展方式加载即可。

修改后可运行基础检查：

```bash
node --check background.js
node --check popup.js
node --check options/options.js
node -e "const fs=require('fs'); JSON.parse(fs.readFileSync('manifest.json')); JSON.parse(fs.readFileSync('rules.json')); console.log('json ok')"
```

## 目录结构

```text
background.js          后台 service worker，负责接口请求、下载队列和下载进度
popup.html             扩展弹窗结构
popup.js               弹窗交互与消息处理
popup.css              弹窗样式
content/listener.js    微博页面内容脚本，负责识别当前页面用户
options/               登录状态检查页
rules.json             图片请求 Referer 规则
utils/                 公共工具和配置
```

## 版本

当前 manifest 版本：`0.3.1`

### 0.3.1

- 移除对 `profile/info`、`getAlbumDetail`、`getImageWall` 等易返回 `Forbidden` 的接口依赖
- 使用 `photo.weibo.com/albums/get_all` 与 `photo.weibo.com/photos/get_all` 读取相册和分页照片
- 修复 `photo.weibo.com/{uid}/albums` 页面用户名识别，避免把标题后缀识别为昵称
- 修复弹窗顶部当前用户链接，统一跳转到 `https://photo.weibo.com/{uid}/albums`
- 修复并发 Blob 下载时文件名偶发变成“下载.jpeg”的问题
- 优化下载队列调度，避免空闲时持续轮询
- 优化停止按钮状态，只有正在下载时允许点击
- 移除 `_metadata` 目录加载问题，避免 Chrome 提示保留目录名错误
