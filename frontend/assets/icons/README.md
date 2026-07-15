# 技能图标

每个技能提供四种透明背景 PNG，尺寸均为 256 × 256：

- `<技能>.png`：默认状态
- `<技能>-pressed.png`：按下状态
- `<技能>-cooldown.png`：冷却状态
- `<技能>-insufficient.png`：能量不足状态

前端统一通过 `src/assets/skillIcons.ts` 获取素材地址，不要在组件中拼接文件名。

