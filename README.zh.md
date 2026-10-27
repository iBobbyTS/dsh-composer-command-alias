# DSH Composer Trigger Aliases

一个 DSH 浏览器端插件，给聊天输入框补上管线本身不接受的两种触发符：

- 「、」——中文输入法按 `/` 键打出来的顿号——打开和 `/` 一样的命令与技能菜单。
- 「$」「￥」只打开技能来源：同一个原生菜单，但只挂技能这一组，所以只列技能。

两者都不改写草稿。按下触发符只是弹出面板；选中候选项才替换触发符那段文本（命令 chip，或 `/名称 ` 技能文本），忽略或关掉面板则消息原样保留。

## 行为

菜单的触发边界与原生 `/` 完全一致（沿用 `@deepseek-ai/dsh-client-ui-input-trigger` 里 `detectTrigger` 的词边界规则）：

| 触发符之前的内容 | 结果 |
| --- | --- |
| 草稿开头（允许前导空白） | 弹出菜单 |
| 空格或换行之后 | 弹出菜单 |
| 标点之后（`：`、`，`、`)`、`！` 等） | 弹出菜单 |
| 汉字、字母、数字、下划线之后 | 不弹任何东西，触发符就是普通文本 |

`$` 和 `￥` 多一条规则，因为中文正文很少打字带空格：只要后面紧跟一个名字形态的字符，它在文本中间也会生效。`用$sectioned` 会弹出技能菜单，`甲$` 和 `价格$100` 则保持不动。

于是「甲、乙」「A、B」原样保留；以「、」起头拿到的完整菜单，`$sec` 拿到的技能菜单按 `sec` 过滤。后续全部走原生管线：候选过滤、键盘导航、输入法处理、Esc、点击，以及被选中后吞掉哪段文本。

因为草稿从头到尾没被改写：

- 打「、goal」时命令菜单按 `goal` 过滤，输入框里仍显示「、goal」；`$sec` 同理。
- 选中命令时「、goal」整段换成命令 chip；选中技能时 `$sec` 换成 `/sectioned-feature-development `。
- 关掉面板或不选直接发送，「、goal」/`$sec` 就作为普通消息文本发出去。
- 不产生撤销记录，输入历史不受影响——插件没有在你背后改字。

## 为什么需要接触发控制器

DSH 没有「新增触发字符」的扩展点：`InputTriggerSource.trigger` 的类型是 `'/' | '@'`，检测核心也只扫描这两个字符。插件即使为「、」或 `$` 注册来源，也永远不会收到候选请求。

所以插件直接驱动管线，走的是输入框自身接线在用的那几个入口：

- 顿号走 `InputTriggerController.track(draft, caret, guard, draftRev)`：把草稿里那个边界顿号按「/」拼一份副本喂进去，原生菜单就基于这个 hit 弹出。hit 的 span 仍指向真实的「、+查询」字符，选中时消费的是用户真正打的字。
- 技能别名走 `InputTriggerController.toggleSource('skill', hit)`：输入框自己的「添加文件或调用指令」按钮就是这条路径，菜单只渲染指定来源。菜单、行、过滤、选中处理全是原生的，只换了来源名单——所以一行面板 UI 都不需要复制。

对外的可见面只有 `conversation.input.overlay` 插槽里一个隐形常驻项，它订阅该会话的输入状态，输入卡片卸载时一并释放。

## 限制

- 用到三处非声明扩展点：用 `[data-composer-input]` 标记读光标，用 controller 的 `track()` / `toggleSource()` 作入口。它们都是各自包里公开的稳定接口，但都不是「插件扩展点」，DSH 后续版本可能在没有通知的情况下改动。
- 要求草稿是单段、无 chip 的纯文本。插件会比对 DOM 文本与已发布的草稿，两者不一致时保持不动——一旦出现引用 chip、命令 chip 或多段落，就属于这种情况。
- 技能面板依赖名为 `skill` 的来源。没加载 `@deepseek-ai/dsh-client-ui-skill` 的 profile 不会有技能菜单，`$` 保持无动作。
- 只代理「、」「$」「￥」；`／` 等其他输入法标点与全角变体不在范围内。

## 安装

把目录作为 DSH bundle 装进目标 profile，例如：

```sh
dsh plugin --profile web add link:/Users/ibobby/Projects/dsh-plugin/dsh-composer-command-alias
```

`dsh plugin ... add` 会链接该包，并把 `@local/dsh-composer-command-alias` 记进 profile 的 `dsh.profile.bundles`；通过插件管理器安装等价。
