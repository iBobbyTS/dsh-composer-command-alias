# DSH Composer Trigger Aliases

[English](README.md) | [简体中文](README.zh.md)

一个 DSH 浏览器端插件，在不改写草稿的情况下打开原生输入菜单：

- `、` 打开原本由 `/` 触发的命令与技能菜单。
- `$`、`￥` 只打开技能菜单。

选中候选项才替换对应触发词；关闭菜单或不选择就发送，保留原文。过滤、键盘导航和输入法处理沿用原生菜单。

## 安装

Desktop 请先启动一次并完全退出，再使用应用自带 CLI 执行下列命令。

使用本仓库的源码 checkout，将下面的绝对路径替换成实际路径，并选择正在使用的 profile：

```sh
dsh plugin --profile desktop add "link:/absolute/path/to/dsh-composer-command-alias"
```

独立 Web profile 将 `desktop` 换成 `web`。该命令会链接 bundle，并把 `@local/dsh-composer-command-alias` 记录到对应 profile。重启对应 DSH 进程并刷新界面。

## 使用与限制

- `、` 沿用原生词边界：草稿开头、空白或标点之后会打开菜单；汉字、字母、数字、下划线之后仍作为普通文本。
- `$`、`￥` 后紧跟名称形态的查询词时，也可在中文中间生效：`用$sectioned` 打开技能，`甲$`、`价格$100` 保持原样。
- 选中 `$sec` 的候选项可插入 `/sectioned-feature-development `。删除触发词会关闭菜单；输入法合成落定后，匹配的菜单继续保持。
- 草稿含引用或 quote chip 时不介入，因为文本与编辑器的坐标不同。
- 技能别名要求 profile 加载 `@deepseek-ai/dsh-client-ui-skill`。`／` 等其他全角字符不在范围内。
- 插件使用输入框内部实现接口，DSH 升级可能改变这些接口。

[开发、兼容性检查与输入法诊断（英文）](docs/DEVELOPMENT.md)
