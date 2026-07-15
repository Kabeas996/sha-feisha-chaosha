# Frontend

当前目录包含 React + Vite 在线房间和本地同屏双人版本。

技能图标已经放在 `assets/icons/`，组件应通过 `src/assets/skillIcons.ts` 选择默认、按下、冷却或能量不足状态。

从项目根目录同时启动前后端：

```powershell
npm.cmd run dev
```

示例：

```tsx
<img
  className="skill-icon"
  src={getSkillIcon("super-kill", energy < 3 ? "insufficient" : "default")}
  alt="超杀"
/>
```
