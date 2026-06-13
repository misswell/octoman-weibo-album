# CLAUDE.md

## 项目开发注意事项

### 微博图片下载

- 不要让 `chrome.downloads.download` 直接下载 `sinaimg.cn` / `sinajs.cn` 图片 URL。实际测试中，Chrome 下载请求可能拿到新浪图床返回的 HTML 或 403，表现为下载文件变成 `.html`，并在 `chrome.downloads.onChanged` 中出现 `SERVER_FORBIDDEN`。
- 微博图片应走 `download_weibo_image()`：由扩展后台 `fetch()` 拉取，设置 `credentials: 'include'`、`referrer: 'https://m.weibo.cn/'`，并用 `Accept: image/*` 类请求头。
- 保存前必须检查响应：
  - `res.ok` 必须为真。
  - `content-type` 必须以 `image/` 开头。
  - 如果返回 `text/html` 或 HTTP 403，应记录 `[download:fetch:error]`，不要把 HTML 保存成图片文件。
- 后台 fetch 成功后再把 `Blob` 转成 data URL，并通过 `chrome.downloads.download({ url: dataUrl, filename })` 保存。

### 文件命名和扩展冲突

- 不要在本扩展中注册全局、无范围限制的 `chrome.downloads.onDeterminingFilename`。它会影响所有下载项，和另一个扩展 `Octoman微博备份` 同时启用时会互相抢文件名。
- 允许使用极窄范围的命名监听：只处理 `data:image/` 开头、且带本项目专属 `#octo_weibo_album_filename=` 标记的下载项。不要处理 `data:text/html`，这是 `Octoman微博备份` 的下载类型。
- 曾遇到的 Chrome 报错：
  - 本扩展尝试把下载文件命名为 `""`。
  - `Octoman微博备份` 已将同一个下载命名为 `WeiboBackup/小卫什么_01.html`。
  - Chrome 因两个扩展同时建议文件名而报冲突。
- 下载前必须通过 `build_download_filename()` 保证传给 Chrome 的 `filename` 非空。
- 如果接口返回的 `pic_name` 为空或被 `reg_filename()` 清洗后为空，应使用 URL basename 或 `download_<timestamp>.jpg` 兜底，并放入 `WeiboAlbum/<album_id>/`。
- 不要恢复旧的无差别 data URL token 命名逻辑，例如 `#octoman_filename=`、基于 download id 猜测归属的 `pendingDataUrlFilenameIds`、`filenameToken`。如果需要给 data URL 图片命名，只能使用当前的项目专属标记，并在监听器中同时校验 `data:image/` 和 token。

### 防盗链和 DNR 规则

- `rules.json` 中的 DNR Referer 规则仍然有价值，主要用于页面、预览或其他浏览器发起的新浪图床请求。
- DNR 不能完全替代后台 fetch。直接下载文件时，新浪图床仍可能返回 HTML/403，所以图片下载链路必须自己校验响应类型。
- `Octoman微博备份` 的 DNR 规则可作为参考，但它主要下载自己生成的 HTML，不直接批量下载图片文件。不要照搬成“Chrome 直接下载图片 URL”的方案。

### 调试日志判断

- `[download:onChanged:filename] ... .html`：说明 Chrome 最终落地的是 HTML 文件，通常是新浪图床防盗链或 403 返回。
- `[download:onChanged:filename] ... 下载.jpeg`：说明图片内容已保存，但 data URL 下载没有吃到目标文件名。应检查 `#octo_weibo_album_filename=` 标记和 `[download:filename:suggest]` 日志。
- `[download:onChanged:error] SERVER_FORBIDDEN`：优先怀疑图床请求被拒，不要先归因于文件名冲突。
- `[download:fetch]` 中 `content_type` 不是 `image/*`：说明后台 fetch 拿到的不是图片，应该失败计数并继续队列。
- `[download:fetch:error] HTTP 403` 或 `Unexpected content-type text/html`：说明当前请求仍被新浪拦截，但代码不应保存错误 HTML。
- `[download:filename:fallback]`：说明原始文件名为空，已启用兜底命名。这个日志不是错误，但如果大量出现，需要检查相册接口字段是否变化。
- `[download:filename:suggest]`：说明本扩展已通过专属 token 给自己的 data URL 图片补了最终文件名。

### 版本记录相关

- `0.3.2` 曾移除 `onDeterminingFilename` 并改为直接下载原图 URL，解决了扩展命名冲突，但引入了新浪图床 HTML/403 问题。
- `0.3.3` 保留“不注册 `onDeterminingFilename`”的原则，同时恢复后台 fetch 图片并校验 `image/*`，避免把 HTML 保存成 `.html`，但 data URL 图片仍可能退化为“下载.jpeg”。
- `0.3.4` 增加仅针对本扩展 `data:image/*` 专属 token 的命名监听，不处理 `data:text/html`，用于修复“下载.jpeg”且避免与 `Octoman微博备份` 冲突。

### 修改下载链路前的检查清单

- 是否会重新引入无范围限制的 `chrome.downloads.onDeterminingFilename`？如果会，先停下来重新设计。
- 命名监听是否同时限制了 `data:image/` 和 `#octo_weibo_album_filename=`？缺一不可。
- 是否可能把空字符串传给 `chrome.downloads.download({ filename })`？必须先兜底。
- 是否可能把 `text/html` 当图片保存？必须检查 `content-type`。
- 是否仍能和 `Octoman微博备份` 同时启用？本扩展不应影响别的扩展创建的下载项。
- 修改后至少运行 `node --check background.js`。
