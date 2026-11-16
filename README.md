# M5Stack Cardputer-Adv · Ekko Studio 插件与固件

按官方 SDK v1 模板制作的独立管理插件。M5 聊天直接使用 Studio 原生接口；**插件可选，不代理聊天、不修改Studio核心；本版加入服务端USB应用升级，OTA仍不支持**。

当前USB升级开发候选为插件 **0.3.0-alpha.1**，捆绑固件 **cardputer-adv-v10.0.0-alpha.6**。上一版0.2.0-alpha.6已完成官方0.8.24本地集成验证；0.3新增USB流程的本机及硬件验收单独记录，[本版检查记录](docs/VALIDATION.zh-CN.md)与alpha5历史分开。alpha6 固件 Release 仍是未公开草稿，不提供其公共下载链接。已公开插件仓库当前版本也不等于本地 alpha6 候选。

本机官方Studio0.8.24已通过实际按钮完成一次同版本重刷，约2分6秒：8MiB私有备份、应用和保留区域校验均通过，用户确认启动视频与Agent首页正常。106项主机测试、10项Chrome沙箱测试通过；这不补齐暂停的16 Agent全量验收，也不等同其他主机平台已验证。

## 三步使用

1. **准备 M5。** 此应用只更新本项目已有的 ESP32-S3／8MiB 双固件布局，不支持陌生设备或新机首刷。[安装教程](docs/INSTALL.zh-CN.md)要求私人备份、布局核对，只写 `0x10000` 并读回验证。
2. **首次绑定一次。** 电脑打开官方 Studio，M5 与电脑接同一 Wi-Fi，从原厂菜单进入 EkkoStudio，在同网浏览器打开设备的 `/device`，选择电脑、登录自己的账号及 Profile。密码只输入原生设备页，不输入插件。有效绑定后日常无需重复登录。
3. **选择并聊天。** 首页方向键浏览，Tab 选 Studio模型／原生CLI，OK 一次进入。打字后 OK 发送，Ctrl＋空格切中英文，Fn＋上下翻记录。长 G0 或 Fn＋空格录音、松开发送，采集就绪后最多 5 秒；短 G0／Esc 返回。

中文模式有拼音预编辑时，第一次 OK 只提交选词或原拼音，再按 OK 才发送。新 Agent／Profile 上下文默认中文，语言状态不保证跨 Agent 统一。[三步教程](docs/QUICKSTART.zh-CN.md)说明日常操作。

## 包内固件与源码

| 材料 | 大小 / SHA-256 |
|---|---|
| alpha6 应用 | 3,321,072 B · `9208e53b8336523b50a3d49ce5a18f559f9aa79a885bef6df2deaf201c930230` |
| `firmware/source.tar.gz` | 10,104,056 B · `dedf8d3dfb27b5c55ecfb2f8bdda018dbae2ae5e5f670fa7de810d08f81d72e0` |

应用外链是[固定公开提交的原始文件](https://raw.githubusercontent.com/thursdaycapital/ekko-cardputer-adv-stock-lan/a78fc66b7b57b06cd1de8dd990d633d0b497fda7/firmware/ekko-cardputer-next-0x10000.bin)，与包内应用按 SHA 核对；不依赖 alpha6 Release 草稿。对应源码快照为 `a78fc66b7b57b06cd1de8dd990d633d0b497fda7`。完整源码、许可和重新链接材料随插件包提供，**暂无独立公开的 alpha6 源码归档下载链接**；请从插件分发包提取 `firmware/source.tar.gz`，按 `firmware/RELINK.md` 使用。

官方 iframe 不提供 USB/WebSerial、直接联网或下载能力。页面给出可复制的公开应用地址，复制到外部浏览器下载；USB升级通过插件后端的原生串口完成，不能由浏览器直接访问USB；仍保留公开应用下载地址及随包源码。实际本地文件路径和校验值以 `firmware/release.json` 为准。

## 当前证据与边界

alpha6 已取得真实 M5 的令牌实际时间过期恢复、普通 Studio 重启恢复、原生设备登记和 LAN 在线证据；Codex 路由的 STT、文字回答及 TTS 已有当前版记录。用户确认打字、翻历史和听感正常，但新启动的按键计数不能独立重现之前操作。

本次录音为松手停止 `released / 4940ms`，不是同次 `wall_limit / 5000ms` 的自动截止证据。16 项实体路由仅 Codex 1 项有当前记录，其余 15 项、Wi-Fi／掉电及完整故障矩阵按用户要求暂停；不把插件本地测试、旧版记录或桌面 14/16 结果当作这些项目通过。详见[固件范围](docs/FIRMWARE.zh-CN.md)。

当前固件只支持局域网，电脑中继在线不代表 M5 跨网可用。电脑 IP 改变时，保存入口不会自动迁移，需用原生设备页重新选择／登录。管理通道在线也不能单独证明账号目录已登记；实际目录状态单独核对。

## 安装可选插件

需要支持官方 SDK v1 的 Studio。SDK 来源为官方 0.8.23／`80d57ddffe3105b3ffadf4cedc0b995ef3951d0f`，本轮宿主基线仍是官方 0.8.24。

本地插件候选使用完整插件目录，在原生插件中心按本地目录流程安装、确认信任并启用；本版升级、读取接口及页面结果见[本版验证记录](docs/VALIDATION.zh-CN.md)，旧0.2记录不代表新USB写入通过。已公开的 [插件仓库](https://github.com/thursdaycapital/ekko-studio-plugin-cardputer-adv)仍可用根地址安装，但取得的版本以安装清单为准，不代表包含尚未合并的0.3候选。页面入口可从插件详情打开，或在头像菜单「导航栏设置」手动添加。

入口为成品 `.mjs`，普通安装无需构建。官方GitHub/npm安装会安装生产依赖；本地目录安装只复制目录，需先按[安装教程](docs/INSTALL.zh-CN.md)准备Node依赖。更新源码不自动改变已安装快照，也不重刷 M5。提交云端目录或 npm 的状态见[提交说明](docs/SUBMISSION.zh-CN.md)。

## 权限与数据

声明 `ui`、`api.read`、`api.write`。USB升级只由真实界面明确确认，未注册为模型工具。使用本次调用者的官方设备接口，前端只收到设备码末六位；不按设备名称推断板型或 IP。偏好按真实账号和 Profile 隔离，只保存设备 ID 与管理地址，不保存 Wi-Fi 密码、账号密码、Token 或 API Key，不读取宿主数据库或凭据。官方固件模型接口可能返回密钥，不能宣称密钥绝不经过设备。

不新增广域 HTTP 权限、下载服务或桥接。原生设备管理只面向可信局域网，不映射公网。Node 插件是可信后端代码，SDK 权限不是操作系统沙箱。

## 开发

```sh
npm install --ignore-scripts --no-audit --no-fund
npm run harness:check
npm test
npm pack
```

浏览器测试使用 `PLAYWRIGHT_MODULE` 与 `CHROMIUM_EXECUTABLE_PATH` 指定已有环境；真实宿主测试使用 `EKKO_STUDIO_ROOT` 指定官方源码副本。以上命令不表示本轮已执行，结果看[验证记录](docs/VALIDATION.zh-CN.md)。

[官方规范](https://github.com/EKKOLearnAI/ekko-studio/blob/80d57ddffe3105b3ffadf4cedc0b995ef3951d0f/docs/plugins.md) · [模板](https://github.com/EKKOLearnAI/ekko-studio/tree/80d57ddffe3105b3ffadf4cedc0b995ef3951d0f/packages/plugin-sdk/template) · [契约](docs/CONTRACTS.md) · [第三方声明](THIRD_PARTY_NOTICES.md)。保留上游 BSL-1.1；库、字体、字典与素材遵循各自许可，不表示上游品牌背书。


## 从插件升级M5

1. 把数据线接到**运行Studio服务的电脑**，打开插件「固件」。
2. 点「扫描USB设备」并选择M5，确认M5Stack Cardputer-Adv型号和已有8MiB双固件布局。
3. 点升级按钮并核对确认框；插件先保存私人完整备份并校验分区，再只写Ekko应用、读回核对。
4. 完成后在M5原厂菜单选择EkkoStudio进入。

当前只提供已有兼容布局的升级，不提供新机首刷。握手失败时，按住G0重新插线进入下载模式再显式重试。取消或拔线不会自动回滚；备份只保留在本机插件数据目录，不上传。详见[USB升级说明](docs/USB_UPDATE.zh-CN.md)。新增USB功能的假设备测试、组件加载检查、真实写入与实机启动验收分别记录。
