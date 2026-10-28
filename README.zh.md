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

于是「甲、乙」「A、B」原样保留；以「、」起头拿到的完整菜单，`$sec` 拿到的技能菜单按 `sec` 过滤。多段落草稿同样适用：第二段开头打「、」一样唤起菜单，光标在段落中间也能用——光标位置取自编辑器自己的投影（每个段间换行算一个字符），不是从 DOM 里量出来的。后续全部走原生管线：候选过滤、键盘导航、输入法处理、Esc、点击，以及被选中后吞掉哪段文本。

因为草稿从头到尾没被改写：

- 打「、goal」时命令菜单按 `goal` 过滤，输入框里仍显示「、goal」；`$sec` 同理。
- 选中命令时「、goal」整段换成命令 chip；选中技能时 `$sec` 换成 `/sectioned-feature-development `。
- 关掉面板或不选直接发送，「、goal」/`$sec` 就作为普通消息文本发出去。
- 删掉触发符（退格、选区删除、或把它改成普通文本）时，面板在这一次编辑里就关掉，不用再按第二次。
- 输入法合成结束（按 Shift 或回车让拼音变成字母）不关面板：那一刻草稿文字没变，只是合成落定，面板按落定后的文字继续过滤。
- 不产生撤销记录，输入历史不受影响——插件没有在你背后改字。

## 为什么需要接触发控制器

DSH 没有「新增触发字符」的扩展点：`InputTriggerSource.trigger` 的类型是 `'/' | '@'`，检测核心也只扫描这两个字符。插件即使为「、」或 `$` 注册来源，也永远不会收到候选请求。

所以插件直接驱动管线，走的是输入框自身接线在用的那几个入口：

- 顿号走 `InputTriggerController.track(draft, caret, guard, draftRev)`：把草稿里那个边界顿号按「/」拼一份副本喂进去，原生菜单就基于这个 hit 弹出。hit 的 span 仍指向真实的「、+查询」字符，选中时消费的是用户真正打的字。
- 光标位置走输入框的 `caretSpan()`：编辑器把可见选区映射到草稿文本时，每个段间换行算一个字符，所以多段落、光标在段落中间都拿得到正确偏移，不需要从 DOM 里重新拼文本（DOM 里段落之间没有换行符，一拼就对不上草稿）。
- 技能别名走 `InputTriggerController.toggleSource('skill', hit)`：输入框自己的「添加文件或调用指令」按钮就是这条路径，菜单只渲染指定来源。菜单、行、过滤、选中处理全是原生的，只换了来源名单——所以一行面板 UI 都不需要复制。它顺手点亮的 launcher 标记随后要用一次空草稿的 `track()` 花掉：那个标记是给「手势打开」的菜单留一次豁免的，会让紧跟着的下一次 `track` 被吞掉，而别名的 token 是打出来的，没有手势可留。
- 重新喂草稿有两个通道：草稿文字变了，输入框会发布输入状态，插件在之后一个微任务里再喂一次（输入框自己的 `track` 先跑，会关掉刚开的面板）；文字没变的提交（合成落定、光标移动、焦点）不发布任何状态，但输入框照样会 `track` 一遍，所以插件同时挂在编辑器的提交回调上，在同一次提交里做最后一句。少了第二个通道，拼音一落定面板就被关死，谁也救不回来。

对外的可见面只有 `conversation.input.overlay` 插槽里一个隐形常驻项，它订阅该会话的输入状态，输入卡片卸载时一并释放。

## 限制

- 用到四处非声明扩展点：`[data-composer-input]` 只用来确认焦点确实在输入框；`SessionInput.caretSpan()` 读光标（在 `SessionInput` 的类型里没有它，但输入框自己的按钮也用这个方法）；编辑器的 `registerUpdateListener`（Lexical 的公开接口）接「文字没变的提交」；controller 的 `track()` / `toggleSource()` 作入口。它们都是各自包里稳定的实现，但都不是「插件扩展点」，DSH 后续版本可能在没有通知的情况下改动。
- 草稿里带 chip 时不动手：草稿会把 chip 展开成文本，而触发管线把 chip 算作一个字符，两套坐标对不上。（普通多段落没有 chip，所以不受影响。）
- 技能面板依赖名为 `skill` 的来源。没加载 `@deepseek-ai/dsh-client-ui-skill` 的 profile 不会有技能菜单，`$` 保持无动作。
- 只代理「、」「$」「￥」；`／` 等其他输入法标点与全角变体不在范围内。

## 排查输入法问题

插件带一份可选的诊断日志，默认关闭。打开后在输入框里操作，每个事件都会变成一行 JSON 落到本地文件：

```sh
python3 tools/log-collector.py --file /tmp/composer-alias.log   # 另开一个终端
```

然后在页面控制台执行 `localStorage['dsh-composer-alias.debug'] = '1'` 并刷新。记录内容包括合成开始/更新/结束（含 `data`）、`beforeinput`/`input` 的 `inputType` 与 `isComposing`、编辑器每次提交、插件每次判断与放弃原因、`track`/`toggleSource`/`pick`/`insertText` 的参数和返回值，以及菜单开关时的快照。关掉用 `localStorage.removeItem('dsh-composer-alias.debug')` 再刷新。

没起收集器也不影响使用：记录会退到页面内的环形缓冲，`__composerAliasDebug.dump()` 直接取，`clear()` 清空。

## 安装

把目录作为 DSH bundle 装进目标 profile，例如：

```sh
dsh plugin --profile web add link:/Users/ibobby/Projects/dsh-plugin/dsh-composer-command-alias
```

`dsh plugin ... add` 会链接该包，并把 `@local/dsh-composer-command-alias` 记进 profile 的 `dsh.profile.bundles`；通过插件管理器安装等价。
