# M5Stack Cardputer-Adv · Ekko Studio 插件与固件

按 Ekko Studio 官方 SDK v1 模板创建的独立插件。提供原生设备状态、连接偏好、固件信息及校验、首次绑定与使用指南。M5 的聊天直接使用 Studio 原生接口；插件不代理聊天，不修改电脑端 Studio。

**插件是可选的管理入口，M5 聊天不依赖安装插件。** 附带固件仅用于本项目既有 8MiB 双固件布局更新，不支持陌生设备或新机首刷。先看[三步使用教程](docs/QUICKSTART.zh-CN.md)，详细边界见[固件说明](docs/FIRMWARE.zh-CN.md)。

当前公开预览为插件 **0.2.0-alpha.5**，捆绑固件 **cardputer-adv-v10.0.0-alpha.5**。独立插件仓库与固件 Release 均已公开；应用和 r2 源码已实际下载并核对大小与 SHA。插件已在未经修改的官方 Studio 0.8.24 中通过普通 Chrome 安装、启用、四页面和真实设备列表检查；本版 M5 实机验收仍待完成，不能沿用旧版测试结果。详见[发布清单](docs/SUBMISSION.zh-CN.md)。

## 能做什么

- 在插件工作区查看 Studio 已登记的原生 MCU 设备，分别显示局域网状态和电脑端中继状态。
- 手动选择 M5Stack Cardputer-Adv，并保存其可信局域网管理地址；偏好按当前账号和 Profile 隔离。
- 查看包内固件的实际大小、SHA-256、安装地址、固定公开下载地址和源码。
- 查看原生绑定及操作教程，无需电脑补丁或新建桥接服务。
- 包内固件保留固定 16 Agent 目录、中文输入、12px 界面、头像、启动动画、按键声及历史翻页；Fn＋空格录音最长 5 秒，在 RAM 压缩暂存，不需要 SD 卡。

原生设备接口没有硬件型号或 IP，插件不会据名称猜型号、自动扫描网络或声称已验证真实 M5。电脑端中继“已连接”也不等于 M5 跨网可用；本版固件只支持局域网。

## 安装插件

需要包含官方 SDK v1 插件中心的 Studio。SDK 来源仍是官方 **0.8.23 / `80d57ddffe3105b3ffadf4cedc0b995ef3951d0f`**；当前兼容宿主为未经修改的官方 **0.8.24**。旧 0.1.1 的真实宿主检查单独留存，alpha.5 最终 r2 捆绑已在该原版宿主完成安装、RPC、四视图实际 Chrome 和原生卸载复测；这不是 M5 实机验收。

1. 打开 Studio「插件中心」→「安装插件」，粘贴 [GitHub 仓库根地址](https://github.com/thursdaycapital/ekko-studio-plugin-cardputer-adv)。
2. 由超级管理员按宿主流程确认信任并安装，再点击「启用」。官方 UI 会自动把仓库地址固定到安装时的完整提交，不需要手动输入 SHA。本轮实际安装固定到 `5c455ed12a8c6cfd9566f03319be5ee810425c13`。
3. 从插件详情进入「设备」，或在头像菜单「导航栏设置」中添加 Cardputer-Adv 入口。

本地安装复制的是安装时快照；改源码后重新安装，或用 `ekko-studio plugins link /absolute/path/to/project` 开发。入口已经是可执行 `.mjs`，普通安装无需运行构建脚本。

独立仓库 `thursdaycapital/ekko-studio-plugin-cardputer-adv` 已公开，根部含 `plugin.json`，仓库根地址的普通 UI 安装流程已实测。不要把固件仓库或 `/tree/...` 子页面当成本插件安装地址。本项目尚未提交 Studio 云端目录审核或发布 npm；材料见 [提交说明](docs/SUBMISSION.zh-CN.md)。

## 绑定与固件

首次绑定：M5 与电脑接同一 Wi-Fi → 进入 EkkoStudio → 在同网浏览器打开设备显示的 `http://设备IP/device` → 选择电脑、登录自己的 Studio 账号和 Profile。密码仅输入原生设备页，不输入插件。插件保存管理地址只为生成入口，不会代替固件内的绑定。

固件安装必须先核对布局并备份，详见[安装教程](docs/INSTALL.zh-CN.md)。实际文件名、版本、大小与 SHA 以插件「固件」页及 `firmware/release.json` 为准。已有布局的应用写入地址为 `0x10000`；禁止写到 `0x0` 或擦除整片 Flash。

插件 iframe 遵循官方沙箱：没有 USB/WebSerial、直接联网或下载权限。因此页面提供可选择、复制的固定下载链接及管理地址；请复制后用外部浏览器打开。刷写由用户在本机运行 esptool 完成，不是插件内一键刷机或 Studio OTA。

## 数据与权限

仅声明 `ui` 与 `api.read`。后端通过当前调用者的 `run.host.request('/api/mcu-devices')` 读取原生设备表；前端只收到设备码末 6 位及必要状态。插件只持久化选中设备 ID 与局域网管理 origin，不保存 Wi-Fi 密码、账号密码、Token 或 API Key，也不读取 Studio 数据库或登录文件。固件模型接口本身可能接收 API Key；这不等于密钥绝不经过设备。

原生设备管理 HTTP 仍以可信局域网为边界，不要映射到公网。第三方 Node 插件是可信代码，SDK 权限并非操作系统级沙箱。源码、许可与素材边界见 [第三方声明](THIRD_PARTY_NOTICES.md)。

## 开发与验证

```sh
npm install --ignore-scripts --no-audit --no-fund
npm run harness:check
npm test
npm pack
```

无需外部运行时依赖。浏览器验证使用已有 Playwright 与 Chromium：

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
CHROMIUM_EXECUTABLE_PATH=/absolute/path/to/chromium \
npm run test:browser
```

可选的官方宿主安装 / 运行时集成测试：对指定官方源码副本先安装其依赖，再执行 `EKKO_STUDIO_ROOT=/absolute/path/to/official-checkout npm run test:host`。该测试只在系统临时目录安装插件快照、使用合成设备 API 数据，不访问日常 Studio 的账号或状态目录。普通单元测试不声称覆盖真实设备或真实 API 响应。

宿主 SDK 与指南在 `sdk/`、`docs/`，插件边界在 `contracts/plugin.json`、[CONTRACTS](docs/CONTRACTS.md)。固件原始公开源码与各组件许可完整保留在 `firmware/source.tar.gz`，修改和重新链接见 `firmware/RELINK.md`。安装插件本身不会重刷设备或升级 Studio。

alpha.5 的 `firmware.validation` 暂为空／未确认，当前 0.8.24 的插件检查不能替代 M5 实测。alpha.3 的中文输入、历史及五秒语音已有历史用户记录，也不能算作 alpha.5 通过。固定 16 Agent 不会自动包含新插件 Agent；所用 Agent 必须已安装、授权和配置。首页 Tab 选择「Studio模型／原生CLI」；兼容模型选择遵循官方配置，原生模式使用该 CLI 的默认设置，不自动换 Agent。`bedrock_converse` 与 `codex_app_server` 不受本版 Studio 模型模式支持。

## 上游

- [官方插件规范](https://github.com/EKKOLearnAI/ekko-studio/blob/80d57ddffe3105b3ffadf4cedc0b995ef3951d0f/docs/plugins.md)
- [官方插件模板](https://github.com/EKKOLearnAI/ekko-studio/tree/80d57ddffe3105b3ffadf4cedc0b995ef3951d0f/packages/plugin-sdk/template)
- 固件源码快照：`d087ae02d5c13ae0ac711a09415cfe8aa31ddcc4`；候选 Release：`thursdaycapital/ekko-cardputer-adv-stock-lan` / `v10.0.0-alpha.5`，已实际下载并核对应用及 r2 源码。

保留上游 BSL-1.1 条款；各组件、字体与素材保留各自许可。本项目是社区适配，不表示 M5Stack、Ekko Studio 或各 Agent 品牌的官方背书。
