# Bilibili Toy 接入记录

核验日期：2026-11-12（北京时间）。本次只做公开资料研究和本地原型准备；未登录账号、上传作品或提交审核。平台规则可能继续变化，发布时以账号后台提示为准。

## 1. 这个游戏怎样发布

Toy 接收前端网页构建产物。我们可以把台球守基地游戏做成 HTML + CSS + JavaScript，打成 ZIP 后上传；不需要把开发环境、Node.js 或源码工程一起交给平台。

推荐顺序：

1. 打开[发布平台](https://www.bilibili.com/toy/publish)。如果账号没有 Toy 权限，从[官方介绍页](https://www.bilibili.com/toy/intro)申请；本次没有查询你的账号状态。
2. 选择上传发布，上传构建 ZIP，填写名称、说明、页面地址（slug）、封面、图标与游戏分类。具体必填项以页面为准。
3. 检查平台预览，首次测试选择链接访问或密码访问，提交审核后在 B站真实容器体验。
4. 确认手机和电脑玩法正常，再把可见范围改为公开。公开发布会关联公开动态，属于真正的对外发布步骤。
5. 后续在发布记录中更新同一个作品；页面地址确定后应保持不变。需要推广时，可以绑定自己发布的视频。

以上流程来自[官方 FAQ](https://www.bilibili.com/opus/1241171666570051585)、[发布帮助](https://www.bilibili.com/toy/publish/guide/faq)和[官方介绍](https://www.bilibili.com/toy/intro)。FAQ 给出的通常审核时长是约 10 分钟，不能当作上线承诺。它建议使用链接或密码访问测试；其中提及的免审调试版本属于计划信息，本次未确认已开放。

## 2. 上传包要求

最稳妥的 ZIP 结构如下，打开压缩包直接看到入口：

```text
game.zip
├── index.html
├── styles.css
└── game.js
```

| 项目 | 已核验要求与本项目选择 |
| --- | --- |
| 入口 | 解压后的入口 `index.html` 不超过 1 MB；脚本、样式单独保存。 |
| 目录 | 当前发布帮助支持根目录或唯一一级子目录含入口；本项目选根目录，兼容长文 FAQ 的要求。 |
| 资源路径 | 使用 `./styles.css`、`./game.js` 等相对路径。网页实际位于 `/toy/<slug>/`，`/assets/...` 会错误地指向站点根目录。 |
| 包体上限 | 10 月 FAQ 写的是 50 MB、可申请扩容；当前发布帮助强调按账号额度，以发布页“包体大小”实际显示为准。 |
| 上传内容 | 上传运行产物；不包含 `.git`、`node_modules`、测试脚本、设计文档或本地服务代码。 |
| 访问链接 | 分享平台生成的完整地址，保留末尾 `index.html`。 |

来源：[官方发布自检清单](https://github.com/bilibili/toy/blob/main/skills/toy/references/content-checklist.md)、[发布帮助](https://www.bilibili.com/toy/publish/guide/faq)、[官方 FAQ](https://www.bilibili.com/opus/1241171666570051585)。

发布帮助列出的允许后缀包括：

- 网页：`.html .htm .css .js .json .wasm`
- 数据：`.data .md .csv .tsv`
- 图片：`.png .jpg .jpeg .gif .svg .webp .ico`
- 字体：`.woff2 .woff .ttf .eot`
- 音频：`.mp3 .wav .ogg .m4a`
- 视频：`.mp4 .webm`
- 引擎资源：`.atlas .ani .part .nani .unityweb`

不在白名单的文件可能被过滤，因此此版采用常规 HTML/CSS/JS。上述列表从[发布页本次公开静态脚本中的 FAQ](https://s1.hdslb.com/bfs/static/toy/app/publish/assets/index-Cw2BHNm0.js)核验；该带哈希地址仅供本次溯源，不应作为项目依赖。

## 3. SDK 接入与边界

[SDK 文档入口](https://www.bilibili.com/toy/publish/sdk)通常要求登录已有 Toy 权限的账号。网页正文未被普通网页抓取返回；本次从发布页公开脚本内附带的官方类型声明，以及公开 CDN SDK 本身，核验了加载方式与下面的基本签名。未执行真实平台 API。

```html
<script src="https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js"></script>
```

该[官方 SDK 文件](https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js)本次返回 HTTP 200，加载后设置 `window.toy`。仅下载成功不代表已经具备平台宿主、登录态和可用服务。

| 能力 | 官方声明中核验的调用形态 | 接入要点 |
| --- | --- | --- |
| 读档 | `toy.getCloudStorage(keys?)` | 返回字符串键值映射，需要登录；按玩家与 Toy 隔离。 |
| 写档 | `toy.setCloudStorage(items)` | 传字符串键值映射；对象存档先 JSON 序列化。 |
| 成绩 | `toy.submitScore({ score, board? })` | 提交绝对整数分数，保留更高成绩；需要登录。 |
| 榜单 | `toy.getRankList({ board?, period?, limit? })` | 游客可以读取；返回排名、成绩、昵称和头像。 |
| 我的排名 | `toy.getMyRank({ board?, period? })` | 需要登录，用返回的 `ranked` 判断是否上榜。 |
| 环境能力 | `toy.isSupport(ability)` | 在使用平台特性前检查支持情况。 |

云存档、排行榜调用失败会拒绝 Promise，应处理错误。读取可缓存，结算时再写档或报分，避免逐帧、每次碰撞或轮询调用。限流应延后重试；不要把公开长文的约 50 QPS 写成保证额度，较新的官方仓库说明阈值可调整。来源：[发布页内附官方类型声明](https://s1.hdslb.com/bfs/static/toy/app/publish/assets/index-Cw2BHNm0.js)、[官方调用节奏说明](https://github.com/bilibili/toy/blob/main/skills/toy/references/content-checklist.md)。

**SDK 是否必须：**查到的上传要求没有把接入 SDK 列为普通静态游戏的前提。由此建议先保证核心游戏独立运行，只有使用云档、榜单、横屏容器等能力时才加载 SDK；这是实现建议，不能替代账号后台的最终校验。正式加入 SDK 时需保留本地存储和无 SDK 的降级路径。

**尚未统一的官方口径：**公开介绍称有 5 个榜位，而本次发布页类型声明的注释仍写 1～3。此版不依赖最大榜位数；将来先接默认榜位，并在后台和真实容器核验。共享存档的公开说明也存在不同口径，此游戏暂不依赖该能力。

## 4. 本项目发布前验证建议

以下是针对游戏的工程建议，不是额外的平台审批要求：

- 用 HTTP 服务打开构建目录，并额外放在子路径下运行，检查相对资源没有 404。
- 鼠标与触摸都完成一次瞄准、蓄力、击球、升级选择、暂停和重开。
- 真机检查横竖屏切换、浏览器工具栏变化与顶部安全区，避免球杆操作被页面滚动或系统区域吞掉。
- 连续游玩到后期，检查多球、多敌人、连锁效果的帧率；切到后台后不能继续扣基地血量。
- 断网、关闭存储权限或 SDK 服务失败时，仍能完成本局。
- 最终 ZIP 再核验入口大小、资源后缀及包内路径。平台预览通过以后，仍需检查真实发布链接。

## 5. CLI 是可选发布方式

Bilibili 另有[官方 Toy CLI 与 Agent 工作流仓库](https://github.com/bilibili/toy)。它通过 OAuth 登录，支持创建、预览、提交、更新和查询；网页发布无需先安装它。本次没有安装 CLI 或修改账号状态。

若之后采用 CLI，应按当时的 `toy --help-json` 获取真实参数；官方流程把生成预览与提交审核分开。具体安装与登录方法参见[官方安装说明](https://github.com/bilibili/toy/blob/main/skills/toy/references/installation.md)。

## 6. 当前 3D 原型的实际接入状态（2026-11-13）

当前源码使用 Three.js WebGL 3D 场景；引擎和纹理随构建包一起提供，运行不依赖第三方 CDN。上传包为 `release/block-bounce-toy.zip`，ZIP 根目录直接含 `index.html`。普通网页环境已可运行，SDK 云存档、排行榜及真实 B站容器仍未联调。本地最佳成绩只保存在当前设备。

本轮按用户要求使用 Mojang 官方 Minecraft Java 1.21.5 原版纹理，这些素材不是开源授权。来源和当前本地原型用途见 `docs/VANILLA_ASSETS.md`。本地构建包可用于验证；公开发布前需要另行核对 Minecraft 官方使用指南、名称与素材要求，不能把此前社区纹理的 CC 许可套在原版资源上。没有上传 Toy、提交审核或公开发布。
