# CLAUDE.md

## 项目开发注意事项

### 微博图片下载

- 不要让 `chrome.downloads.download` 直接下载 `sinaimg.cn` / `sinajs.cn` 图片 URL。实际测试中，Chrome 下载请求可能拿到新浪图床返回的 HTML 或 403，表现为下载文件变成 `.html`，并在 `chrome.downloads.onChanged` 中出现 `SERVER_FORBIDDEN`。
- 微博图片应走 `download_weibo_image()`：由扩展后台 `fetch()` 拉取，设置 `credentials: 'include'`、`referrer: 'https://m.weibo.cn/'`，并用 `Accept: image/*` 类请求头。
- 保存前必须检查响应：
  - `res.ok` 必须为真。
  - `content-type` 必须以 `image/` 开头。
  - 如果返回 `text/html` 或 HTTP 403，应记录 `[download:fetch:error]`，不要把 HTML 保存成图片文件。
- 后台 fetch 成功后不要再把 `Blob` 转成 data URL。大图片或 ZIP 的超长 base64 URL 会让 Chrome 主进程复制大量字符串，严重时直接崩溃。
- 图片和 ZIP 都应走 `download_blob_via_offscreen()`：后台把 Blob 写入 IndexedDB，offscreen 页面读取后创建短 `blob:` URL，再调用 `chrome.downloads.download({ url: blobUrl, filename })`。
- offscreen 页面只负责从 IndexedDB 读取 Blob 并创建短 `blob:` URL；真正保存文件必须由 background 调用 `chrome.downloads.download({ url: blobUrl, filename })`。不要让 offscreen 直接调用 `chrome.downloads`，offscreen 能力受限时会导致 ZIP 全部保存失败。

### 文件命名和扩展冲突

- 不要在本扩展中注册 `chrome.downloads.onDeterminingFilename`。即使监听器只处理特定 data URL，Chrome 仍会把它纳入全局文件名仲裁，和另一个扩展 `Octoman微博备份` 同时启用时可能互相抢文件名或报空文件名冲突。
- 图片和 ZIP 都应直接通过 `chrome.downloads.download({ url, filename })` 命名。ZIP 不要附加 token；图片也不要附加 `#octo_weibo_album_filename=` token。
- 曾遇到的 Chrome 报错：
  - 本扩展尝试把下载文件命名为 `""`。
  - `Octoman微博备份` 已将同一个下载命名为 `WeiboBackup/小卫什么_01.html`。
  - Chrome 因两个扩展同时建议文件名而报冲突。
- 下载前必须通过 `build_download_filename()` 保证传给 Chrome 的 `filename` 非空。
- 如果接口返回的 `pic_name` 为空或被 `reg_filename()` 清洗后为空，应使用 URL basename 或 `download_<timestamp>.jpg` 兜底，并放入 `WeiboAlbum/<album_id>/`。
- 不要恢复旧的 data URL token 命名逻辑，例如 `#octoman_filename=`、`#octo_weibo_album_filename=`、基于 download id 猜测归属的 `pendingDataUrlFilenameIds`、`filenameToken`。

### 打包下载

- 打包下载使用后台生成的无压缩 ZIP，不依赖外部库。不要为了 ZIP 引入远程依赖或运行时网络加载脚本。
- ZIP 包内下载成功/失败仍按图片数量计数；包进度另用 `package_done` / `package_total` 表示，不要混在图片成功数里。
- `package_size` 是用户语义上的“每个 ZIP 包最多多少张图片”，不是体积拆分阈值。默认 500 时，一个逻辑包应尽量包含 500 张；只有超过保护性 ZIP Blob 上限时才允许拆成 `用户名_001_01.zip` 这类分片，不能再出现普通图片被 8MB 阈值拆成每包 1-2 张的回归。
- 打包文件名必须来自当前账号昵称，例如 `胖达MOER_001.zip`。如果页面误识别出“下载”“微博”“微相册”等通用词，必须丢弃并回退到 UID，不能把 ZIP 命名为“下载.zip”。
- 打包模式不能等所有相册分页都请求完成后才开始抓图片。图片列表页返回后，应立即把图片加入 `zipItem` 队列并开始后台 fetch；分页请求、图片抓取、ZIP 生成要能流水线推进。
- `zipSave` 必须比后续 `zipItem` 优先执行。一个包抓满后，要先生成并交给 Chrome 下载，不能排在几千个图片抓取任务后面导致“只见打包不见下载”。
- 打包必须有内存背压：包分配应尽量在图片真正开始抓取时发生；抓到的图片先暂存 IndexedDB，builder 只保留 key、大小和 CRC；有关闭但未落盘的包时，不继续启动新包图片抓取。不要一次把多个 500 张包的二进制图片都堆在 service worker 内存里。
- 打包分页也必须有背压：列表接口累计拿到当前包数量后，先停止继续翻页；等当前包 ZIP 保存完成并释放 builder 后，再继续请求后续页面。不要让 UI 出现“已抓取 1048 张，但只保存 216 张、正在处理第 9 包”的失控状态。
- 打包抓图不能直接使用用户设置的 10 并发；应使用较低的独立并发（当前 `MAX_PACKAGE_FETCH_CONCURRENT = 3`）并带轻量重试，避免新浪图床大量 403/HTML/连接失败。
- 打包目录必须是 `Downloads/WeiboAlbum/用户名/`，ZIP 文件名是 `用户名_001.zip`。不要再使用 `用户名_相册名` 作为打包目录；逐张下载可以继续使用相册目录。
- 打包进度不能显示“第 0 包”或 “95 / 0”。每个 `zipItem` 必须先绑定一个真实 package builder，再更新 `package_current_index` / `package_current_total`。
- 打包过程中不能只在 ZIP 创建完成后更新进度。每处理完一张图片都要更新 `package_processed` 和 `package_current_done` 并推送 popup，否则大包如 500 张会长时间显示 0。
- popup 主进度应显示实际已保存图片数和失败数；“正在抓取/生成 ZIP”的后台处理量应放到状态行或包内进度里，避免和实际保存进度混淆。
- 下载进度说明要尽量写成具体后台步骤，例如“正在识别当前微博页面和当前用户”“正在请求相册列表第 2 页”“正在获取相册图片列表第 5 页”“正在把第 5 页的 30 张图片加入打包队列”，不要只写“后台处理中”。
- 包内单张图片 fetch 失败时，应记录 `[download:zip:item:error]` 并计入失败数；其他图片仍然写入 ZIP。
- 包内存在失败项时，必须把 `download_failures.txt` 写入当前 ZIP，包含文件名、URL、错误信息和时间，方便用户不用打开扩展后台控制台也能定位失败原因。
- 如果整个 ZIP 下载创建失败，这一包图片都应计入失败。
- 每包数量通过 `package_size` 配置保存，当前限制为 1 到 500，默认值是 500。
- ZIP 文件名应使用用户昵称加编号，例如 `胖达MOER_001.zip`，不要使用固定的 `package_001.zip`；打包目录是 `Downloads/WeiboAlbum/用户昵称/`。
- ZIP 不要使用 `queue_data_url_filename()` / `append_data_url_token()`，否则会和 `chrome.downloads.download({ filename })` 形成双重命名，报“无法将下载的文件命名为空字符串，因为另一扩展程序已命名”。
- 大 ZIP 不能通过 data URL 下载，曾导致 Chrome `EXC_BREAKPOINT (SIGTRAP)` 崩溃。生成 ZIP Blob 前必须按 `MAX_ZIP_BLOB_BYTES` 自动拆成多个 ZIP 分包，并同步增加 `package_total_extra`，保证包进度和实际下载数量一致。
- 队列里只剩 `finish` 且 `downCurrent > 0` 时，不要立刻重新调度 `drainQueue()`；等待活动下载回调后再执行 finish，避免后台空转刷屏。

### 下载队列、暂停和删除

- 下载队列必须区分“暂停”和“删除”：暂停保留队列、分页位置和 package builder，继续后恢复；删除才清队列、清定时器、清 package builder、移除 session。
- 暂停/删除必须 abort 当前相册的活动 `fetch()`。只清 `setTimeout` 或只把 UI 按钮改成“继续”不算暂停成功。
- 队列调度遇到暂停相册的任务时要保留任务并跳过，不能 `pop()` 后丢弃；遇到删除相册的任务才丢弃。
- 被 abort 的 `down` / `zipItem` 在暂停状态下要重新放回队列，在删除状态下直接退出且不能再计成功/失败进度。
- 删除后即使已有 Blob/Chrome download 回调返回，也不能再写入该相册进度、不能重新创建 session、不能让后台继续翻页。
- `finish` 只能在该相册没有活动下载、没有待保存 ZIP、没有未完成 package builder 时执行，避免 ZIP 还没保存就显示“下载完成”。
- 以后修改下载链路时，必须手测：每包 500、ZIP 文件名为当前账号名、暂停后进度不动、继续后恢复、删除后后台停止、边请求分页边抓图、进度不出现 `0 / 0`。

### 防盗链和 DNR 规则

- `rules.json` 中的 DNR Referer 规则仍然有价值，主要用于页面、预览或其他浏览器发起的新浪图床请求。
- DNR 不能完全替代后台 fetch。直接下载文件时，新浪图床仍可能返回 HTML/403，所以图片下载链路必须自己校验响应类型。
- `Octoman微博备份` 的 DNR 规则可作为参考，但它主要下载自己生成的 HTML，不直接批量下载图片文件。不要照搬成“Chrome 直接下载图片 URL”的方案。

### 调试日志判断

- `[download:onChanged:filename] ... .html`：说明 Chrome 最终落地的是 HTML 文件，通常是新浪图床防盗链或 403 返回。
- `[download:onChanged:filename] ... 下载.jpeg`：说明图片内容已保存，但 `chrome.downloads.download({ filename })` 没有吃到目标文件名。应检查传入 `download_direct()` 的 `filename` 是否非空且路径合法，不要用 `onDeterminingFilename` 兜底。
- `[download:onChanged:error] SERVER_FORBIDDEN`：优先怀疑图床请求被拒，不要先归因于文件名冲突。
- `[download:fetch]` 中 `content_type` 不是 `image/*`：说明后台 fetch 拿到的不是图片，应该失败计数并继续队列。
- `[download:fetch:error] HTTP 403` 或 `Unexpected content-type text/html`：说明当前请求仍被新浪拦截，但代码不应保存错误 HTML。
- `[download:filename:fallback]`：说明原始文件名为空，已启用兜底命名。这个日志不是错误，但如果大量出现，需要检查相册接口字段是否变化。
- `[download:zip:start]`：说明 ZIP 已生成并开始交给 Chrome 下载；`files` 是包内成功写入数量，`failed` 是包内拉取失败数量。
- `[download:zip:item:error]`：说明包内某张图片拉取失败，不代表整个包失败。
- `[download:blob:offscreen:error] Offscreen document is not ready` 后接 `fallback is too large`：说明图片和 ZIP 已生成，但保存 ZIP 的 offscreen 桥没准备好。大 ZIP 不能回退 data URL，必须等待并重试 offscreen 下载。
- `[download:zip:download:error]`：说明 ZIP 保存失败，不代表包内图片抓取失败。不要把这一包的图片数全部计入 `download_fail`；应保留 `zipSave` 任务重试，连续失败后暂停等待用户继续。
- Chrome 崩溃报告出现主进程 `EXC_BREAKPOINT (SIGTRAP)`，且下载时正在处理大批图片/ZIP：优先检查是否重新引入了 `data:` URL 下载或过大的 ZIP Blob。

### 版本记录相关

- `0.3.2` 曾移除 `onDeterminingFilename` 并改为直接下载原图 URL，解决了扩展命名冲突，但引入了新浪图床 HTML/403 问题。
- `0.3.3` 保留“不注册 `onDeterminingFilename`”的原则，同时恢复后台 fetch 图片并校验 `image/*`，避免把 HTML 保存成 `.html`，但 data URL 图片仍可能退化为“下载.jpeg”。
- `0.3.4` 增加仅针对本扩展 `data:image/*` 专属 token 的命名监听，不处理 `data:text/html`，用于修复“下载.jpeg”且避免与 `Octoman微博备份` 冲突。
- `0.3.5` 新增打包下载，按配置数量生成无压缩 ZIP；命名监听扩展到本扩展专属 token 的 `data:application/zip`。
- `0.3.6` 将打包默认值改为每包 500 张，并在 popup 下载进度中显示 ZIP 包进度条和已打包数量。
- `0.3.7` 移除 ZIP data URL token，ZIP 只通过 `download({ filename })` 命名，避免和 `onDeterminingFilename` 双重命名冲突。
- `0.3.8` 修复打包进度和实际下载不一致；新增后台动作状态显示；大 ZIP 自动拆分，避免 `Invalid string length`。
- `0.3.9` 细化下载进度说明，显示识别用户、相册列表分页、图片列表分页、队列入队、抓图、生成和保存 ZIP 等具体动作。
- `0.3.10` 完全移除 `onDeterminingFilename` 监听，图片 data URL 也只使用 `download({ filename })` 命名，避免影响 `Octoman微博备份` 等其他扩展的下载命名。
- `0.3.11` 移除图片和 ZIP 的 data URL 下载，改为 IndexedDB + offscreen Blob URL 下载，降低 Chrome 主进程崩溃风险。
- `0.3.12` 修复 offscreen 未就绪导致 `Could not establish connection. Receiving end does not exist.`，background 创建 offscreen 后必须等待 ping 成功再发送 Blob URL 请求；Blob URL 下载失败时允许小分包回退到 data URL。

### 修改下载链路前的检查清单

- 是否会重新引入 `chrome.downloads.onDeterminingFilename`？如果会，先停下来重新设计。
- 图片和 ZIP 是否都只通过 `chrome.downloads.download({ filename })` 命名，没有 token、没有监听器？
- 是否避免了 `data:` URL 下载大图片或 ZIP？应使用 `download_blob_via_offscreen()`。
- offscreen 下载桥是否有 ready/ping 握手？如果没有，刚创建 offscreen 后立刻 `sendMessage` 会导致所有 ZIP 分包失败。
- 打包下载是否仍然按图片数更新 `download_suc` / `download_fail`，并单独更新 `package_done`？不要把 ZIP 包数混进图片成功数。
- 是否可能把空字符串传给 `chrome.downloads.download({ filename })`？必须先兜底。
- 是否可能把 `text/html` 当图片保存？必须检查 `content-type`。
- 是否仍能和 `Octoman微博备份` 同时启用？本扩展不应影响别的扩展创建的下载项。
- 修改后至少运行 `node --check background.js`。
