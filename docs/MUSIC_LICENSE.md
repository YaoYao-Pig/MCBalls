# Minecraft 音乐许可核验

核验日期：2026-11-14（北京时间）。本次仅查阅官方或权利人页面，没有下载、提取或打包 Minecraft 原版音乐。

## 本项目结论

**不能把 Minecraft 原版 BGM 统一当作开源音乐。当前没有取得将所选原曲复制、打包并分发到这个独立 Bilibili Toy 游戏的明确许可。** 本项目选择用 Web Audio 演奏新写的原创 BGM，不把原版录音、音乐下载链接或原曲扒谱放入游戏包。

“能播放或购买下载”“适合视频创作者使用”和“开放授权给另一款游戏复制、发行”是不同范围。本记录并不宣称所有作者、所有曲目都有相同条款，也不把没有找到许可等同于权利人绝不授权。

## 已核验依据

### Minecraft 官方创作者音乐政策

[Can I use Minecraft Music?](https://www.minecraft.net/en-us/article/can-i-use-minecraft-music-)说明：经认可且由 Minecraft 拥有的曲目，可以用于 Minecraft 相关创作者内容；商业内容还需符合 Usage Guidelines。文中举例包括游戏实况、直播、播客和角色扮演视频，示例并非穷尽列表。许可对象是：

> “approved Minecraft-owned music tracks”

该政策并不是 CC0、CC BY 或其他开源/开放素材许可。它同时区分 Minecraft 自有曲目与第三方授权曲目；后者需要向对应权利人确认，Mojang 不能代替第三方再次授权。官方还说明认可播放列表可能变动。[官方帮助页](https://help.minecraft.net/hc/en-us/articles/21984449056781-Using-Minecraft-Music-in-Videos-and-Streams)使用相同的创作者内容口径。

**对本游戏的判断：**独立网页游戏把录音作为运行资产交付，与发布 Minecraft 实况视频不同。上述公开政策没有明确说明“将原曲放入另一款独立游戏包”这一用途；因此本项目不据此认定已获音乐再分发许可。如果以后指定使用某首原曲，应先确认该曲权利人以及许可是否覆盖独立游戏、网页交付、复制和分发。这是本项目基于条款范围作出的判断，不是对全部 Minecraft 曲目的一概禁止结论。

### EULA 与使用指南

[Minecraft EULA](https://www.minecraft.net/en-us/eula)把复制游戏内容给他人列入分发，并要求取得相应允许；其概要写道：

> “Do not distribute or make commercial use of anything we've made without our permission.”

[Usage Guidelines 的 Music and audio 部分](https://www.minecraft.net/en-us/usage-guidelines)要求确认音频权利人的许可。该指南对“商业使用”的定义也包含与他人分享的免费内容，因此免费发布 Toy 不会自动变成不受限制的个人使用。这里只用于解释为何不能把视频政策直接当成游戏素材许可证。

### C418：能确认的内容与 FAQ 限制

C418 本人的 [《Minecraft》曲目页面](https://c418.bandcamp.com/track/minecraft)提供试听和购买下载，但许可栏明确为：

> “all rights reserved”

这至少证明所核验曲目不能因“能下载”而被标成 CC 或开源素材。该页面不构成新游戏的音乐授权。

已尝试访问 C418 官方 FAQ 的[历史固定地址](https://c418.org/2017/01/26/what-am-i-allowed-to-do-with-daniels-music/)，本次返回 404；官网其他抓取内容也异常，未能核验现行 FAQ 正文。因此本文**不引用论坛转述的 FAQ 条款作为当前授权**，也不声称已确认其最新视频使用例外、价格或具体授权流程。

### Lena Raine 及其他作者

Lena Raine 官方的 [Nether Update 项目页](https://lena.fyi/projects/2020/4/11/minecraft-nether-update-2020)与 [The Wild Update 项目页](https://lena.fyi/projects/2022/12/6/minecraft-the-wild-update-2022)能确认她参与对应音乐创作，但页面未提供把音乐开放授权给另一款游戏分发的条款。

本次没有逐首核查 Lena Raine 或其他作曲家、唱片公司、出版方的权利归属。不能仅凭作者姓名、Minecraft 官方播放列表或原版安装文件的存在，推定某一首曲目适用哪种独立游戏许可。

## 当前项目采用的音频方案

- 使用本项目新写的 Web Audio 乐句及合成音色，不下载原版 Minecraft BGM。
- 音乐和交互音效保留可关闭的控制；具体播放行为以当前实现为准。
- 原版纹理的来源记录与音频方案分别说明，纹理归属不会自动赋予音乐使用权。
- 若以后引入外部音乐，为每首曲目记录作者、录音与作品许可、来源、用途范围及署名要求，再决定是否随 Toy 包分发。

