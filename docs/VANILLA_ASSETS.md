# Minecraft 原版纹理：原型素材来源记录

核验与提取日期：2026-11-13（北京时间）。这次按用户要求改用 **Mojang 官方原版材质**，没有采用 Pixel Perfection CE 或其他替换材质。本记录只对应 `assets/minecraft/`；旧的 `assets/voxel/` 是另外一套素材，许可不能混用。

## 官方来源与校验

选用已正式发布的 **Minecraft Java Edition 1.21.5**，用于固定原型表现，不把它称为当前最新版本。该版本可由[官方发布说明](https://www.minecraft.net/en-us/article/minecraft-java-edition-1-21-5)及[官方版本清单](https://piston-meta.mojang.com/mc/game/version_manifest_v2.json)核验。

| 文件 | 官方来源 / 校验结果 |
| --- | --- |
| 版本 JSON | `https://piston-meta.mojang.com/v1/packages/deed2dfe12bd2f6dd3397178c68ce07d0a8f2604/1.21.5.json` |
| 版本 JSON SHA-1 | `deed2dfe12bd2f6dd3397178c68ce07d0a8f2604`，与官方版本清单一致。 |
| Client JAR | `https://piston-data.mojang.com/v1/objects/b88808bbb3da8d9f453694b5d8f74a3396f1a533/client.jar` |
| Client JAR 大小 | 28,984,409 字节。 |
| Client JAR SHA-1 | `b88808bbb3da8d9f453694b5d8f74a3396f1a533`，与版本 JSON 一致。 |

下载缓存位于 `.cache/minecraft-1.21.5/`，包括官方清单、版本 JSON 和客户端 JAR；缓存不属于游戏运行素材，也不应放进网页包。只按清单提取所需 PNG，没有运行客户端或提取游戏代码。

## 提取清单

首批提取 **56 张 PNG**，保留原始像素与文件字节，只重命名以方便渲染器引用；后续扩充也遵守相同规则。`assets/minecraft/sources.json` 是当前完整清单，记录每张图在官方 JAR 内的路径、尺寸、字节数和提取后的 SHA-256。

| 简短文件名 | 对应原版素材 |
| --- | --- |
| `grass-top.png`、`grass-side.png`、`grass-side-overlay.png` | 草方块顶、侧、侧面染色覆盖层。 |
| `dirt.png`、`stone.png` | 泥土、石头。 |
| `iron.png`、`gold.png`、`diamond.png`、`redstone.png` | 铁块、金块、钻石块、红石块。 |
| `ice.png` | 浮冰（`packed_ice.png`），不是透明普通冰。 |
| `obsidian.png`、`wood-planks.png` | 黑曜石、橡木板。 |
| `beacon.png`、`glass.png` | 信标、玻璃。 |
| `tnt-side.png`、`tnt-top.png`、`tnt-bottom.png` | TNT 三类表面。 |
| `crafting-top.png`、`crafting-side.png` | 工作台顶面和正面。 |
| `stick.png`、`bone.png`、`blaze-rod.png` | 原版木棍、骨头、烈焰棒物品纹理。 |
| `end-rod.png` | 原版末地烛方块 UV 纹理。 |
| `zombie.png` | 原版僵尸皮肤，64×64。 |
| `skeleton.png`、`creeper.png` | 原版骷髅、苦力怕皮肤，各 64×32。 |
| `enderman.png`、`enderman-eyes.png` | 原版末影人皮肤和眼睛覆盖层，各 64×32。 |
| `slime.png` | 原版史莱姆皮肤，64×32。 |
| `blaze.png` | 烈焰人皮肤，64×32。 |
| `wither.png` | 凋灵正常皮肤，64×64；非无敌态纹理。 |
| `dragon.png` | 末影龙皮肤，256×256。 |
| `warden.png` | 监守者皮肤，128×128。 |
| `oak-log.png`、`oak-log-top.png`、`oak-leaves.png` | 橡木原木侧面、端面和叶片，各 16×16；树叶需要运行时染绿。 |
| `iron-ore.png`、`coal-ore.png`、`diamond-ore.png` | 铁矿、煤矿、钻石矿，各 16×16。 |
| `gunpowder.png`、`ender-pearl.png`、`apple.png` | 火药、末影珍珠、苹果物品，各 16×16。 |
| `shield-base.png`、`shield-base-nopattern.png` | 盾牌图集，各 64×64；后者为无纹样盾牌。 |
| `iron-golem.png` | 铁傀儡主体皮肤，128×128。 |
| `snow-golem.png` | 雪傀儡主体皮肤，64×64。 |
| `villager.png` | 村民身体基础层，64×64，源文件为 `entity/villager/villager.png`。 |
| `villager-plains.png` | 平原村民服装覆盖层，64×64。 |
| `librarian.png`、`weaponsmith.png`、`toolsmith.png` | 图书管理员、武器匠、工具匠职业覆盖层，各 64×64。 |
| `iron-ingot.png` | 铁锭物品，16×16。 |
| `pumpkin.png`、`pumpkin-side.png`、`pumpkin-top.png` | 雕刻南瓜正面、普通南瓜侧面、南瓜顶面，各 16×16。 |
| `snow-block.png` | 雪块材质，16×16，源文件为 `block/snow.png`。 |

方块与物品纹理均为 16×16。草顶是供生物群系染色的灰度纹理；在 Three.js 里保持最近邻采样，并对草顶和草侧覆盖层分别染色。玻璃及部分覆盖纹理保留透明通道。实体皮肤是展开的 UV 图集，应用到三维模型各部件，不能把整张图直接作为单张怪物精灵显示。村民身体、平原服装、职业装分别原样保留，未预合成；渲染时对应图层应使用同一套村民 UV。

本目录只提供原版纹理；本项目的头、身体、四肢等真实三维方盒几何由渲染代码构建。没有把二维图集改名为“三维模型”，也没有引入第三方替代皮肤。

### 粘液方块与材料补充

2026-11-14 从同一缓存 JAR 追加两张 16×16 原图，并重新校验 JAR SHA-1 与官方版本 JSON 一致：

| 本地文件 | JAR 原路径 | 字节数 |
| --- | --- | --- |
| `slime-block.png` | `assets/minecraft/textures/block/slime_block.png` | 195 |
| `slime-ball.png` | `assets/minecraft/textures/item/slime_ball.png` | 197 |

文件像素、调色板和透明度未经修改。粘液块原图的透明度为 180 / 255，渲染时启用透明混合并保持 `opacity: 1` 即可保留原图透明程度；黏液球作为材料物品图标使用。两张图仍属 Mojang / Microsoft 原版资产，不是开源素材。

## 权利标记与本次范围

这些纹理是 **Minecraft 原版游戏资产，权利归 Mojang / Microsoft**，不是开源资源，**不适用 CC BY-SA、MIT 或 Pixel Perfection 的许可**。文件能从官方 CDN 下载，不等于允许任意再发布。

这些素材最初用于用户授权的本地原型，后续按用户要求将项目托管到 GitHub 并配置 GitHub Pages 演示。GitHub 托管不改变素材的原有权利归属，也不代表获得额外素材授权；Bilibili Toy 上传和审核尚未完成。本记录保留官方来源与权利归属。涉及对外使用时应以[官方 EULA](https://www.minecraft.net/en-us/eula)和[使用指南](https://www.minecraft.net/en-us/usage-guidelines)为准。

可用于当前原型的标识：

> Minecraft 原版纹理 © Mojang / Microsoft。非官方网页原型，与 Mojang 或 Microsoft 无关联，未获其认可。
