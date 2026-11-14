# 方块主题素材来源

> 历史记录：本文对应早期使用 Pixel Perfection 的版本。当前三维游戏使用的素材与权属以 [VANILLA_ASSETS.md](VANILLA_ASSETS.md) 和 `assets/minecraft/` 中的记录为准。

核验和下载日期：2026-11-13（北京时间）。

## 采用的素材

此版采用 **Pixel Perfection Community Edition (CE)** 的 26 张 PNG。它是 XSSheep 的原创替换材质包及社区延续项目，采用 **CC BY-SA 4.0**。项目 README 明确要求贡献者不得直接复制 Minecraft 原版内容；原作者也明确允许这些纹理用于其他项目及游戏。没有下载或使用 Mojang 游戏资源提取仓库。

- [Pixel Perfection CE 源仓库](https://github.com/Athemis/PixelPerfectionCE)
- [固定版本 README 与署名](https://github.com/Athemis/PixelPerfectionCE/blob/28e38cab7c1f03f86364ef704f705bebcc13cb3d/README.md)
- [固定版本完整许可](https://github.com/Athemis/PixelPerfectionCE/blob/28e38cab7c1f03f86364ef704f705bebcc13cb3d/LICENSE.md)
- [XSSheep 原始发布帖及授权](https://www.minecraftforum.net/forums/mapping-and-modding-java-edition/resource-packs/1242533-pixel-perfection-now-with-polar-bears-1-11)

下载固定在提交 `28e38cab7c1f03f86364ef704f705bebcc13cb3d`；26 个 PNG 均已通过 Git blob SHA-1 与上游树记录比对。PNG 没有修改像素，仅改为简短文件名。逐文件原始路径、URL 和校验值记录在 `assets/voxel/sources.json`。

## 文件清单与使用方式

所有路径以 `assets/voxel/` 开头：

| 本地文件 | 尺寸 | 用途与备注 |
| --- | --- | --- |
| `grass-top.png` | 16×16 | 草方块顶面，原图为灰度，渲染时乘绿色。 |
| `grass-side.png` | 16×16 | 自带绿色草边的侧面。 |
| `dirt.png` | 16×16 | 土地、草方块底面。 |
| `stone.png` | 16×16 | 石块弹珠、场地装饰。 |
| `iron.png` | 16×16 | 铁块弹珠。 |
| `ice.png` | 16×16 | 冰块弹珠，保留透明度。 |
| `gold.png` | 16×16 | 金块弹珠。 |
| `diamond.png` | 16×16 | 钻石方块或稀有升级。 |
| `obsidian.png` | 16×16 | 黑曜石边框。 |
| `redstone.png` | 16×16 | 红石构筑、充能效果。 |
| `tnt-side.png`、`tnt-top.png` | 各 16×16 | 爆炸方块。 |
| `wood-planks.png` | 16×16 | 木板边界、UI 面板。 |
| `crafting-top.png`、`crafting-side.png` | 各 16×16 | 工作台基地。 |
| `stick.png` | 16×16 | 木棍初始球杆，道具图标。 |
| `bone.png` | 16×16 | 骨头球杆，道具图标。 |
| `blaze-rod.png` | 16×16 | 烈焰棒球杆，道具图标。 |
| `end-rod.png` | 16×16 | 末地烛方块 UV 材质，并非完整物品图标；配程序生成的细杆和底座。 |
| `zombie.png` | 64×64 | 僵尸皮肤图集。 |
| `skeleton.png`、`creeper.png` | 各 64×32 | 骷髅、苦力怕皮肤图集。 |
| `slime.png` | 128×64 | 史莱姆皮肤图集，可作备用怪物。 |
| `gui-icons.png`、`gui-widgets.png` | 各 256×256 | 血量、快捷栏和像素面板图集。 |
| `ui-background.png` | 32×32 | 可重复铺设的 UI 背景。 |

方块可以直接把 16×16 纹理映射到 Canvas 生成的三个面；设置 `imageSmoothingEnabled = false`。僵尸、骷髅、苦力怕的头部正面均位于源图 `(8, 8, 8, 8)`，可用作俯视怪物的方块头部。整图是 UV 图集，不应直接当作单个怪物平面图片绘制。

这版不需要下载外部三维模型。调查到 VoxeLibre 的 `mobs_mc` 模型另有 GPLv3 许可，不能把纹理的 CC 许可套用到模型上；这里采用本项目自行构建的立方体几何，再贴开放纹理。没有复制 VoxeLibre 游戏代码或模型。

## 随包保留的许可与署名

- `assets/voxel/LICENSE-CC-BY-SA-4.0.md`：上游完整许可文本。
- `assets/voxel/UPSTREAM-README.md`：上游原始说明和贡献者名单。
- `assets/voxel/CREDITS.md`：本项目的署名、来源、修改说明。
- `assets/voxel/sources.json`：固定版本逐文件清单与校验值。

原作者为 **Hugh “XSSheep” Rutland**；上游另署名社区贡献者 **StonePendant、freejusticehere、Stingraych、Nova_Wostra、lazerl0rd**，以及维护者 **Athemis**。这些信息应在游戏的“素材与许可”入口可见，并随上传包保留。

CC BY-SA 4.0 允许复制和改编，包括商业使用；需要保留合理署名、许可链接、修改说明，并以同许可分发这些纹理的改编。运行时的裁切、着色和纹理映射按改编注明；不把本项目所有独立游戏代码笼统标为纹理许可。参见 [Creative Commons 官方许可说明](https://creativecommons.org/licenses/by-sa/4.0/)。

## Minecraft 名称与非官方标识

按 [Minecraft 官方使用指南](https://www.minecraft.net/en-us/usage-guidelines)本次核验结果，Minecraft 名称可以作真实描述用途的次要标题，不能成为主要或显著标题；不能让作品看起来获得 Mojang/Microsoft 认可，还应明确作品发布者及联系方式。

因此，用户提出的“我的世界弹弹乐”可以作为开发工作名；面向发布的标题建议以“弹弹乐”为主，把 Minecraft 风格说明放在次要位置。首页和发布说明使用明确文字：

> 非官方作品，与 Mojang 或 Microsoft 无关联，未获其认可。

这段标识不会把素材许可变成官方授权。游戏继续使用本项目标题字样及 Pixel Perfection 的社区纹理，不使用官方 Minecraft Logo、官方字体或从游戏中提取的原版贴图。
