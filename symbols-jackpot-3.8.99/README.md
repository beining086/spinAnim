# 矿业图标中奖循环

四个图标各有一套可独立加载的 Spine 3.8.99 骨架。动画统一命名为 `jackpot_loop`，周期 **1.5 秒**，时间轴为 30 fps，第 45 帧回到第 0 帧。原画布为 504 × 464 px，根骨在画布中心。

[下载四套动画的 ZIP](./symbols-jackpot-3.8.99.zip) · [打开循环预览](./preview.webp)

![四个矿业图标的中奖循环，从左到右为矿车、淘金盘、矿灯和交叉工具](./preview.webp)

| 源素材 | ZIP 内目录 | 中奖动作 | `win_impact` 帧（从 0 起） |
| --- | --- | --- | ---: |
| `s1.psd` | `s1-minecart/` | 矿车起步颠簸，车轮滚动一圈，金矿和宝石弹起并扫光 | 14 |
| `s3.psd` | `s3-gold-pan/` | 淘金盘先压后扬，碎金错峰飞起，金光掠过盘沿 | 12 |
| `s4.psd` | `s4-miners-lantern/` | 矿灯摆动，灯芯点亮，绿光和余烬随摆动收回 | 13 |
| `s5.psd` | `s5-crossed-tools/` | 镐和铲分开蓄势，交击时迸出火星，两把工具回弹归位 | 14 |

## 导入 Spine 编辑器

1. 解压 ZIP，保留每个图标目录中的 `images/` 文件夹。
2. 在 Spine 3.8.99 中选择「导入数据 / Import Data」，导入同名 `.json`，缩放保持 `1`。
3. 切到动画模式，选择 `jackpot_loop`，开启循环播放。可以另存为 `.spine` 工程。

矿车的 `static_card` 插槽和其他图标的 `photoshop_rest_pose` 插槽使用对应 PSD 的合成静帧。编辑动作时，可在动画中临时关闭该插槽查看下方拆件。

## 在游戏中播放

使用 Spine 3.8 Runtime 加载图标目录中同名的 `.json`、`.atlas` 及图集引用的所有 PNG。矿车图集有两页，其余各有一页。PNG 使用直通透明度，运行时关闭 PMA。播放 `jackpot_loop` 时把 `loop` 设为 `true`。每轮触发一次 `win_impact` 事件，可用于同步音效。

四套动画均用官方 Spine 3.8 WebGL Runtime 加载、渲染并连续循环两轮。第 0 帧和第 45 帧相同，也和各自 PSD 的合成图像素一致。已检查动作峰值与循环接点。ZIP 提供可导入的 JSON 和单图，本次验证使用 Runtime。
