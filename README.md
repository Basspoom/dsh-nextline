# NextLine

[English](README.en.md) | 简体中文

**像你自己输入的下一句。** 为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）提供个性化的下一条消息建议。

![NextLine 建议示意](docs/preview.svg)


`v0.1.2` · DSH `0.2.2-rc.2`–`0.3.0` · 桌面 / Web

## 功能

- 助手完成回复后，在空输入框显示浅灰建议。
- **Tab** / **→** 采纳为草稿，**Esc** 关闭；采纳后可编辑再发送。
- 正在输入、输入法组合、有附件、有排队消息或会话生成中不显示。
- 颜色跟随 DSH 主题。

**最近更新** · [v0.1.2](https://github.com/Basspoom/dsh-nextline/releases/tag/v0.1.2) 新增语气预设和「祖安」彩蛋，可调节温暖度、热情度和表情符号用量。

## 安装

需要 DSH 桌面 / Web `0.2.2-rc.2` 至 `0.3.0` 之前；暂不支持终端 TUI。

从 GitHub：

```powershell
dsh plugin --profile desktop add "https://github.com/Basspoom/dsh-nextline/archive/refs/tags/v0.1.2.tar.gz"
```

或在 **插件** 页面选择 **添加插件**，粘贴：

```text
https://github.com/Basspoom/dsh-nextline/archive/refs/tags/v0.1.2.tar.gz
```

从本地目录：

```powershell
npm install
dsh plugin --profile desktop add "<path-to-NextLine>"
```

链接安装不会自动安装依赖；`npm install` 会安装 `zod` 和 `@deepseek-ai/schemastery`。修改 `src/` 后重启 DSH 或重新加载插件。

在 **设置 → 插件** 确认已启用。卸载：

```powershell
dsh plugin --profile desktop remove dsh-nextline
```

## 使用

完成一轮对话，清空输入框，按 **Tab** 或 **→** 采纳建议，按 **Esc** 关闭。建议只在会话空闲、最后一条是助手文字回复时出现。

## 配置

在 **设置 → 插件 → NextLine** 中调整，或写入 profile 的 `cordis.patch.yml`：

```yaml
- id: nextline
  config:
    enabled: true
    historyEnabled: true
    historyDays: 30
    historySessionLimit: 10
    timeoutMs: 15000
    maxSuggestionChars: 240
    provider: ''
    model: ''
```

`historyEnabled: false` 只使用当前对话；`enabled: false` 停止生成。`provider` / `model` 同时填写才生效，不需要 API key。

每个完成轮次最多一次额外请求，输出上限 192 tokens，总超时 15 秒；历史检索最多 1.5 秒，并优先使用最近会话。

## 数据与隐私

- 当前对话和少量历史文本会发送给当前模型提供方。
- 不新增外部服务，不保存凭据，不训练模型；历史缓存仅在宿主内存中。
- 建议以 `plugin:nextline/suggestion` 写入会话日志，不进入正常对话消息。
- 敏感会话可关闭 `historyEnabled` 或整个插件。打字会隐藏建议，但已发出的请求仍可能计费。

## 兼容性

已在 DSH `0.2.2-rc.2` 验证；`engines.dsh` 为 `>=0.2.2-rc.2 <0.3.0`。DSH 升级后如输入框接口变化，建议界面可能自动停用，聊天不受影响。

## 开发

```powershell
npm run build
npm test
npm pack --dry-run
```

`lib/client.js` 由 `npm run build` 生成，请与 `src/client.js` 一起提交。更多检查见 [CONTRIBUTING.md](CONTRIBUTING.md)，发布步骤见 [RELEASING.md](RELEASING.md)，安全问题见 [SECURITY.md](SECURITY.md)。

