# 截图 / Screenshots

把界面截图按下列**文件名**放进本目录（`docs/screenshots/`），README 里的画廊就会自动显示。
Put UI captures here using the **exact filenames** below and the README gallery lights up.

| 文件名 / filename | 内容 / what to capture |
| --- | --- |
| `demo.gif` | 录屏转 GIF：跑一遍闭环（启动策略 → 成交 → 持仓/盈亏更新）。A short screen-recording of the loop. |
| `dashboard.png` | 首页看板（总权益、权益曲线、资产构成）。Home dashboard. |
| `terminal.png` | 交易终端（盘口 + K 线 + 下单面板）。Trading terminal. |
| `strategy.png` | 策略页（机器人列表 + 盈亏概览卡）。Strategy page + PnL card. |
| `risk.png` | 风控页（用量进度条、风控事件）。Risk page. |
| `backtest.png` | 回测页（参数 + 结果图）。Backtest page. |
| `login.png` | 登录页（波浪 logo）。Login page. |

## 建议 / Tips

- 截图建议浏览器宽度 **1440–1600px**、统一浅色或深色主题，更整齐。
- GIF 控制在 **10–15 秒、< 10MB**（GitHub 单图上限较友好）。录屏命令示例：
  ```bash
  # mov/mp4 → gif（1280 宽，12fps）
  ffmpeg -i demo.mov -vf "fps=12,scale=1280:-1:flags=lanczos" -loop 0 docs/screenshots/demo.gif
  ```
- 也可不提交文件：在 GitHub 网页编辑 README 时**直接把图片/视频拖进编辑框**，GitHub 会上传到它的 CDN 并生成链接（视频会渲染成可播放器）。
