# 提交 Ekko Studio 插件

公开预览为 `0.2.0-alpha.5`，按官方模板独立打包；独立插件仓库与固件 Release 已发布，下载校验及最终 r2 插件宿主复测已通过。尚未提交 Studio 云端目录审核或发布 npm，本版 M5 实机验收仍待完成。公开材料不得包含私人完整备份、NVS、Wi-Fi 密码、认证 / API Key 或原始日志。

## 仓库结构

独立公开仓库 [thursdaycapital/ekko-studio-plugin-cardputer-adv](https://github.com/thursdaycapital/ekko-studio-plugin-cardputer-adv) 已创建，在默认分支根目录包含 `plugin.json`、可执行入口和全部分发文件。不要把裸固件仓库当插件安装源。

元数据中的 `repository`、`documentation`、`issues`、`changelog` 指向该公开仓库。日常官方 Studio 0.8.24 已通过普通 Chrome 登录、插件中心提交 HTTPS 根地址、确认信任、安装与启用；官方 UI 自动固定到完整提交 `5c455ed12a8c6cfd9566f03319be5ee810425c13`。四个实际页面、真实设备列表和应用／r2 源码校验均正常；不需要用户手输提交或改电脑后端。`package.json` 保留 private 阻止误发 npm，不影响 GitHub 或本地安装。

运行 `npm run harness:check`、`npm test`、浏览器测试与 `npm pack`，检查打包内容。远程安装禁止生命周期脚本，当前 `.mjs` 已可直接执行，没有构建前提。随包保留 SDK、文档、源码和许可材料。

## 官方提交入口

在 Studio「插件中心」选择「提交插件」。填写独立仓库的 **HTTPS 根地址**、下列名称和描述，人工核对后提交。该操作发送云端审核申请，不等于立即上架；安装仍按宿主要求确认信任，新插件默认禁用。

名称：

```text
M5Stack Cardputer-Adv
```

描述：

```text
M5Stack Cardputer-Adv 的 Ekko Studio 设备管理与固件配套插件。使用官方 SDK v1，在统一工作区查看原生 MCU 局域网状态、保存按账号和 Profile 隔离的管理入口，并提供可校验的固件、完整源码和中文安装 / 绑定指南。设备聊天直接复用 Studio 原生协议，不修改电脑端后端、不增加桥接服务。

固件 alpha.5 预览提供固定 16 Agent 选择、Studio模型／原生CLI 模式、中文输入、历史及最长 5 秒的无 SD RAM 录音；实际可用性取决于电脑安装、授权和模型配置。本包仅含已有本项目精确 8MiB 双固件布局的应用更新，不支持新机首刷、跨网远程或插件内 USB / OTA 刷写。SDK 来自官方 0.8.23 对应提交，宿主兼容基线为未经修改的官方 0.8.24；当前固件 M5 实测仍待完成。旧版验收与插件检查不能替代本版实机。第三方素材与许可限制在包内声明。
```

## 尚需完成的发布门槛

- 独立仓库已经公开并实测根地址安装；提交云端目录审核前，继续核对届时的默认分支、元数据链接和版本。
- 未经修改的官方 Studio 0.8.24 上，以本版 alpha.5 验证真实 M5 的绑定、中文输入、历史、语音和恢复。SDK / 模拟 / 旧版结果不等于本版实机通过。
- 若要支持新用户从出厂设备安装，需要另行提供完整首刷方案，并实测空白 NVS 首次开机和绑定；本更新包不能承担该范围。
- 核对头像、视频等素材的公开再分发授权；缺许可的替换或取得授权，不能用上游代码许可覆盖。
- 确认 BSL-1.1 使用条件及各组件许可，保留完整对应源码和重新链接材料。

这些限制已在 README、固件页和安装说明同步。此阶段可以本地试装、检查与评审，不能把未验证项目标成全面兼容正式版。

## 候选发布前的最终核对

alpha.5 镜像与对应源码已经本地捆绑，版本及目标链接已填入；以下步骤仍须依据真实发布和测试结果完成：

- `plugin.json` 和 `package.json` 同为 `0.2.0-alpha.5`；目标独立仓库根部须确有清单、可执行入口及全部捆绑材料。
- `firmware/release.json` 对应实际 3,321,056 B 应用与源码归档。公开源码提交固定 `d087ae02d5c13ae0ac711a09415cfe8aa31ddcc4`，不得用另一个没有对应代码的提交替代。
- 固件仓库发布 `v10.0.0-alpha.5`，资产名精确为 `cardputer-adv-v10.0.0-alpha.5-update-0x10000.bin` 与 `cardputer-adv-source-v10.0.0-alpha.5-r2.tar.gz`。下载后比较本地 SHA；标签、同名文件或 URL 格式正确都不代替字节校验。
- 两项交互能力已按固件实现声明；其存在不表示本版全部操作已完成实机验收，真实结果仍看 validation 与本版证据。
- `pluginSdk.hostVersion`、`firmwareOnThisHostPhysicallyValidated` 与 `firmware.validation` 必须来自该捆绑固件的真实记录。分别填写文字、语音、自动截止、完整采集字节、全部 Agent 和恢复矩阵，不能用插件测试或旧固件验收代替。
- 同步 README、FIRMWARE、INSTALL 的实际捆绑版本／文件与验证说明；运行 harness、单元、浏览器和隔离宿主测试后再打包。插件仍为可选管理界面，仅声明 `ui`／`api.read`；不把固件仓库直接作为插件安装 URL，不宣传插件内 USB 刷写。
