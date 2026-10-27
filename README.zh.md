# DSH Composer Command Alias

一个 DSH 浏览器端插件：在聊天输入框里用中文顿号「、」打开和「/」一样的命令与技能菜单。中文输入法下按 `/` 键通常打出的是「、」，这个插件让你不必切到英文布局就能用上命令和技能。

按下「、」只是弹出面板，顿号仍留在草稿里：选中候选项才会替换它（命令 chip，或 `/名称 ` 技能文本）；忽略或关掉面板，消息就按原样保留。

## 行为

菜单的触发边界与原生 `/` 完全一致（沿用 `@deepseek-ai/dsh-client-ui-input-trigger` 里 `detectTrigger` 的词边界规则），判断的是顿号前一个字符：

| 顿号之前的内容 | 结果 |
| --- | --- |
| 草稿开头（允许前导空白） | 按 `/` 语义弹出命令菜单 |
| 空格或换行之后 | 弹出命令菜单 |
| 标点之后（`：`、`，`、`)`、`！` 等） | 弹出命令菜单 |
| 汉字、字母、数字、下划线之后 | 不弹任何东西，顿号就是普通文本 |

于是「甲、乙」「A、B」原样保留，而以「、」起头的消息和以「/」起头的消息表现一致。后续全部走原生管线：命令、技能分组、键盘导航、候选过滤、`@` 引用、Esc 退出，以及被选中后吞掉哪段文本。

因为草稿从头到尾没被改写：

- 打「、goal」时菜单按 `goal` 过滤，而输入框里显示的仍是「、goal」。
- 选中命令后，「、goal」整段被替换成命令 chip，和手打 `/goal` 后选中的效果一样。
- 关掉面板、或不选直接发送，「、goal」就作为普通消息文本发出去。
- 不产生撤销记录，输入历史不受影响——插件没有在你背后改字。

## 为什么需要接触发控制器

DSH 没有「新增触发字符」的扩展点：`InputTriggerSource.trigger` 的类型是 `'/' | '@'`，检测核心也只扫描这两个字符。插件即使为「、」注册来源，也永远不会收到候选请求。

`InputTriggerController.track(draft, caret, guard, draftRev)` 是输入框自身接线调用的唯一入口，而 `ctx.inputTriggers.sessionOf(sessionCtx)` 是 input-trigger 服务公开的方法。插件拿到的是输入框正在用的同一个 controller：把草稿里那个边界顿号按「/」拼一份副本喂进去，原生菜单就基于这个 hit 弹出。hit 的 span 仍然指向真实的「、+查询」字符，所以选中时的消费路径作用在用户真正打的字上。

对外的可见面只有 `conversation.input.overlay` 插槽里一个隐形常驻项，它订阅该会话的输入状态，输入卡片卸载时一并释放。

## 限制

- 用到两处非声明扩展点：用 `[data-composer-input]` 标记读光标，用 controller 的 `track()` 作入口。两者都是各自包里公开的稳定接口，但都不是「插件扩展点」，DSH 后续版本可能在没有通知的情况下改动。
- 要求草稿是单段、无 chip 的纯文本。插件会比对 DOM 文本与已发布的草稿，两者不一致时保持不动——一旦出现引用 chip、命令 chip 或多段落，就属于这种情况。
- 只代理「、」；`／` 等全角变体和其他输入法标点不在范围内。
- `$` / `￥` 的「只列技能」面板不在本插件内：原生菜单无法按来源过滤，那需要单独的自绘面板。

## 安装

把目录作为 DSH bundle 装进目标 profile，例如：

```sh
dsh plugin --profile web add link:/Users/ibobby/Projects/dsh-plugin/dsh-composer-command-alias
```

`dsh plugin ... add` 会链接该包，并把 `@local/dsh-composer-command-alias` 记进 profile 的 `dsh.profile.bundles`；通过插件管理器安装等价。
