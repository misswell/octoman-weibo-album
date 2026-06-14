# Octo 微博相册批量下载

一个用于批量下载微博用户相册图片的 Chrome 扩展。当前版本已迁移到 Manifest V3，并适配新版微博相册接口与图片防盗链下载。

## 功能

- 读取当前微博页面对应用户的相册列表
- 支持从 `weibo.com/u/{uid}` 与 `photo.weibo.com/{uid}/albums` 页面识别用户
- 支持从列表页识别多个用户，并切换下载对象
- 批量下载单个相册图片，按“用户昵称_相册名”创建下载目录
- 支持逐张下载或按指定数量打包为 ZIP 下载
- 支持下载比例选择，例如 100%、50%、10%
- 支持下载并发数设置
- 每个相册可独立停止、继续、删除下载记录
- 下载进度自动保存，关闭弹窗后重新打开可恢复
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
4. 可按需调整下载比例、并发数量、是否打包下载、每包图片数量、完成后是否打开文件夹
5. 点击相册卡片开始下载

下载目录默认位于 Chrome 下载目录下：

```text
WeiboAlbum/用户昵称_相册名/
```

开启打包下载后，会按设置数量生成 ZIP 包：

```text
WeiboAlbum/用户昵称_相册名/用户昵称_001.zip
WeiboAlbum/用户昵称_相册名/用户昵称_002.zip
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

### 下载成 HTML 文件或文件名变成“下载.jpeg”

通常是图片防盗链导致。当前版本会先由扩展后台带微博 referrer 拉取图片并校验必须是 `image/*`，再通过内部 Blob URL 保存。如果仍出现该问题，可以在扩展后台控制台查看 `[download:error]` 或 `[download:fetch:error]` 日志。

> 0.3.10 起，本扩展完全不注册 `chrome.downloads.onDeterminingFilename`，图片和 ZIP 都只在创建下载时传入 `filename`。这样不会参与其他扩展的全局下载命名仲裁，避免和 `Octoman微博备份` 互相抢名或出现空文件名冲突。

### 下载时 Chrome 崩溃

0.3.11 起，图片和 ZIP 不再使用超长 `data:` URL 下载。扩展会把 Blob 暂存到 IndexedDB，再由 offscreen 页面创建短 `blob:` URL 交给 Chrome 下载，降低大批量图片或大 ZIP 下载时 Chrome 主进程崩溃的风险。

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

当前 manifest 版本：`0.3.18`

### 0.3.18

- 修复 ZIP 保存失败后把整包 500 张全部计入失败的问题：ZIP 保存失败会重试，连续失败后暂停并保留当前包，不再继续抓下一包。
- offscreen 页面只负责创建短 `blob:` URL，真正保存仍由 background 调用 `chrome.downloads.download({ filename })`，保证 `WeiboAlbum/用户名/用户名_001.zip` 路径由 Chrome downloads API 处理。
- 移除 offscreen 直接调用 `chrome.downloads` 的路径，避免 offscreen 能力受限导致 ZIP 全部保存失败。

### 0.3.17

- 修复 ZIP 保存时 offscreen 页面未及时 ready 导致失败的问题：不再对大 ZIP 直接回退 data URL，而是等待并重试 offscreen Blob 下载。
- 看到 `Offscreen document is not ready` 后接 `fallback is too large` 时，说明失败发生在 ZIP 保存桥，不是图片抓取阶段。

### 0.3.16

- ZIP Blob 下载链路曾尝试由 offscreen 页面直接调用 `chrome.downloads.download({ filename })`，后来在 `0.3.18` 改回 background 执行保存，offscreen 只负责创建短 `blob:` URL。
- 打包图片先暂存 IndexedDB，ZIP 构建时用 Blob parts 组合，避免为了控制内存把 500 张包截成一百多张。
- 打包失败项会写入 `download_failures.txt` 并随当前 ZIP 一起保存，便于追查 HTTP 403、HTML 响应、网络中断等失败原因。

### 0.3.15

- 打包下载改为“一次只预取一个包”：图片列表累计到当前包数量后暂停继续翻页，等当前 ZIP 保存完成后再获取后续页面。
- 打包目录改为 `Downloads/WeiboAlbum/用户名/用户名_001.zip`，逐张下载仍按相册目录保存。
- 打包抓图使用独立限流，最多 3 路并发，并对单张图片 fetch 做一次重试，降低新浪图床 403/HTML/连接失败造成的大量失败。
- 抓到的图片先暂存 IndexedDB，builder 只保留 key、大小和 CRC，避免 500 张图片同时堆在后台内存中。
- 每个 ZIP 若体积过大仍会拆成多个分片，但逻辑包仍按设置的 500 张推进。

### 0.3.14

- 修复打包抓图任务持续推进但 ZIP 保存任务排队太靠后，导致“只见打包不见下载、已保存长期为 0”的问题。
- `zipSave` 改为优先任务，一个包抓满后会先生成并交给 Chrome 下载。
- 增加打包内存背压：有关闭但未保存的包时，不继续启动新包抓图，避免多个大包图片同时堆在后台内存里。
- 打包主进度增加“已抓取”数量，区分“已经抓到后台”和“已经生成 ZIP 保存”。

### 0.3.13

- 重构打包下载队列：图片列表分页返回后立即进入 `zipItem` 队列，分页请求和图片抓取可并行推进。
- 修复“每包 500 但实际每包只有 1-2 张”的问题，体积拆分只作为超大 ZIP 的保护性兜底。
- ZIP 文件名优先使用当前账号昵称，避免误识别成“下载.zip”。
- 修复暂停/删除只改 UI、不停止后台任务的问题：暂停会 abort 当前请求并保留队列，删除会清队列、清定时器并阻止后续回调写进度。
- 修复打包进度出现“第 0 包”或 “95 / 0”的显示问题。

### 0.3.12

- 修复 offscreen 页面未就绪导致 ZIP 保存失败：`Could not establish connection. Receiving end does not exist.`
- Blob URL 下载失败时增加小分包 data URL 兜底，避免“抓图成功但 ZIP 一个都没落地”

### 0.3.11

- 图片和 ZIP 下载改为 IndexedDB + offscreen Blob URL，不再生成超长 data URL，降低 Chrome 崩溃风险
- ZIP 单个分包体积阈值调低，避免过大的 Blob 一次性交给 Chrome 下载模块

### 0.3.10

- 完全移除 `chrome.downloads.onDeterminingFilename` 监听，避免影响 `Octoman微博备份` 等其他扩展的下载命名
- 图片下载不再附加文件名 token，统一依赖 `chrome.downloads.download({ filename })` 命名

### 0.3.9

- 下载进度说明细化为具体后台步骤，包括识别用户、获取相册列表第几页、解析图片列表第几页、加入下载/打包队列、抓取包内图片、生成和保存 ZIP
- 相册列表加载区域也会显示当前正在获取用户信息或列表分页，避免用户误以为程序没有动作

### 0.3.8

- 打包下载的主进度改为显示实际已保存图片数和失败数，避免把“后台已抓取”误当作“已下载完成”
- 下载进度中显示后台当前动作，例如正在抓取图片、生成 ZIP、保存 ZIP 或失败原因
- 大 ZIP 会自动拆成多个较小 ZIP，避免生成超大下载载荷
- 队列中只剩完成任务但仍有 ZIP 在处理时不再反复空转刷屏

### 0.3.7

- ZIP 下载不再附加 data URL 命名 token，避免 `chrome.downloads.download({ filename })` 和 `onDeterminingFilename` 双重命名冲突
- 打包文件名使用“用户名_编号”，例如 `胖达MOER_001.zip`

### 0.3.6

- 打包下载默认每包 500 张
- 打包模式下载进度中新增 ZIP 包进度条，拉取图片过程中也会实时前进
- 显示当前包内进度和已打包数量，例如“第 1 包 120 / 500 张 · 已打包 0 / 13 包”

### 0.3.5

- 新增“打包下载”选项
- 支持设置每多少张图片生成一个 ZIP 包
- ZIP 包内保留微博原始图片名，并对重复文件名自动追加序号
- 打包下载仍使用后台 fetch 校验 `image/*`，避免 HTML/403 错误内容进入 ZIP

### 0.3.4

- 仅针对本扩展带专属标记的 `data:image/*` 下载补文件名
- 避免与 `Octoman微博备份` 的 `data:text/html` 下载命名冲突

### 0.3.3

- 恢复后台 fetch 图片并校验 `image/*`
- 避免新浪图床返回 HTML/403 时保存成 `.html`

### 0.3.1

- 移除对 `profile/info`、`getAlbumDetail`、`getImageWall` 等易返回 `Forbidden` 的接口依赖
- 使用 `photo.weibo.com/albums/get_all` 与 `photo.weibo.com/photos/get_all` 读取相册和分页照片
- 修复 `photo.weibo.com/{uid}/albums` 页面用户名识别，避免把标题后缀识别为昵称
- 修复弹窗顶部当前用户链接，统一跳转到 `https://photo.weibo.com/{uid}/albums`
- 修复并发 Blob 下载时文件名偶发变成“下载.jpeg”的问题
- 优化下载队列调度，避免空闲时持续轮询
- 优化停止按钮状态，只有正在下载时允许点击
- 移除 `_metadata` 目录加载问题，避免 Chrome 提示保留目录名错误
