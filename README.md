# 极速赛道 · Turbo Circuit 🏎️

一个基于 **Three.js** 的 3D 网页赛车游戏：闭合式赛道、街机漂移物理、3 圈计时赛，开箱即玩，无需任何外部素材。

## 特性

- **程序化赛道**：闭合 CatmullRom 曲线，沥青路面、红白路肩、护栏、棋盘格起跑线与起点门架
- **低多边形赛车**：6 种车漆可选，车灯 / 尾翼 / 车轮转向与旋转、车身侧倾、氮气尾焰
- **街机物理**：油门、刹车、倒车、速度感应转向、空格手刹漂移、草地减速、护墙碰撞反弹
- **完整比赛流程**：3-2-1-GO 倒计时、圈数统计、本圈 / 最快单圈计时、逆行警告、一键重置
- **幽灵车**：最佳圈速轨迹自动保存（localStorage），比赛中回放半透明幽灵车与自己竞速
- **AI 对手**：3 名 AI 车手沿赛道自动行驶（弯道减速、车道摆动），与玩家碰撞交互，实时排名
- **漂移计分**：按漂移角度 × 速度累计分数，连续漂移连击倍率最高 x5
- **氮气加速**：Shift / 触屏按钮消耗氮气瞬间提速，漂移充能 + 赛道氮气补给点拾取
- **沉浸感**：追踪相机 + 速度 / 氮气 FOV 拉伸、漂移烟尘粒子、WebAudio 程序化引擎音效、高速暗角
- **HUD**：实时速度表、比赛计时、排名、漂移分数、小地图（含赛车方向箭头）、氮气槽
- **全平台输入**：键盘 + 触屏虚拟按键（转向 / 油门 / 刹车 / 漂移 / 氮气），响应式布局适配窄屏

## 快速开始

环境要求：**Node.js 18+**（npm 随 Node 自带），无其他依赖。

```bash
git clone https://github.com/gh1573/turbo-circuit.git
cd turbo-circuit
npm install
npm run dev          # 开发模式 → http://localhost:5173
```

生产构建：

```bash
npm run build        # TypeScript 检查 + 打包到 dist/
npm run preview      # 本地预览生产构建
```

## 操作

| 按键 | 功能 |
| --- | --- |
| ↑ / W | 油门 |
| ↓ / S | 刹车 / 倒车 |
| ← → / A D | 转向 |
| 空格 | 手刹漂移 |
| Shift | 氮气加速 |
| R | 重置到赛道 |
| M | 静音开关 |
| Esc / P | 暂停 / 继续 |
| Enter | 开始 / 再来一局 |

移动端会显示触屏按钮（左 / 右转向 + 油门 / 刹车）。

## 技术栈

- [Three.js](https://threejs.org/)（r180）— 渲染、PBR 材质、阴影、环境反射
- [Vite](https://vitejs.dev/) + TypeScript — 构建与类型检查
- 纹理全部由 Canvas 程序化生成，音效由 WebAudio 振荡器合成 —— 零外部资源

## 项目结构

```
src/
├── main.ts        # 入口
├── game.ts        # 主循环、比赛状态机、相机、计圈逻辑
├── track.ts       # 赛道曲线、采样、路面/路肩/护栏/门架几何
├── car.ts         # 赛车模型与街机物理
├── env.ts         # 天空穹顶、灯光、草地、实例化树木
├── hud.ts         # HUD、小地图、菜单与覆盖层
├── input.ts       # 键盘 + 触屏输入
├── audio.ts       # 程序化引擎音效
└── particles.ts   # 漂移烟尘粒子
```

## 自定义

- 赛车性能：`src/car.ts` 中的 `MAX_SPEED` / `ACCEL` / `NITRO_BOOST`
- 比赛圈数：`src/game.ts` 中的 `totalLaps`
- AI 数量与水平：`src/game.ts` 中的 `AI_COUNT` 与 `aiSkills`
- 赛道形状：`src/track.ts` 中的 `CONTROL_POINTS` 控制点
- 车漆颜色：`src/hud.ts` 中的 `SWATCH_COLORS`

## License

MIT
