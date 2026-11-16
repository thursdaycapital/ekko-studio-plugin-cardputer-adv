# 提交 Ekko Studio 插件

当前准备的是本地 `0.2.0-alpha.6` 候选，不把已公开仓库的旧alpha5当成本版发布。alpha6固件Release仍为草稿；本版插件已通过日常官方0.8.24原生升级、三个读取RPC及四页面检查，保留设置和启用状态。尚未提交本版云端目录审核或发布npm。

## 固定材料

- 插件独立仓库：[thursdaycapital/ekko-studio-plugin-cardputer-adv](https://github.com/thursdaycapital/ekko-studio-plugin-cardputer-adv)。发布时仓库根须包含`plugin.json`、成品入口及全部捆绑材料；不使用裸固件仓库或`/tree/...`子页面作为安装源。
- `plugin.json`与`package.json`版本统一为`0.2.0-alpha.6`，继续官方SDK v1、`ui`／`api.read`和当前调用者／Profile作用域；不新增HTTP服务、聊天桥接或刷写权限。
- 应用`cardputer-adv-v10.0.0-alpha.6`：3,321,072B、SHA `9208e53b8336523b50a3d49ce5a18f559f9aa79a885bef6df2deaf201c930230`；对应源码快照`a78fc66b7b57b06cd1de8dd990d633d0b497fda7`。
- 应用只用[固定公开提交 raw 文件](https://raw.githubusercontent.com/thursdaycapital/ekko-cardputer-adv-stock-lan/a78fc66b7b57b06cd1de8dd990d633d0b497fda7/firmware/ekko-cardputer-next-0x10000.bin)；alpha6草稿Release不列为公共下载。
- 对应`firmware/source.tar.gz`：10,104,056B、SHA `dedf8d3dfb27b5c55ecfb2f8bdda018dbae2ae5e5f670fa7de810d08f81d72e0`，随插件包提供，无独立公开下载。清单不得伪造Draft源码URL。

清单应明确草稿发布状态。旧清单缺省按已发布处理；本地源码归档没有下载URL时，只显示随包提供。链接格式正确、标签或文件名相同都不替代本地字节校验。

## 提交前需要核对

1. 原生插件中心支持的本地目录安装，确认信任、启用、偏好隔离、四视图和真实设备字段须用本版验证；alpha5旧宿主证据单列历史。
2. 运行`npm run harness:check`、`npm test`、浏览器及官方宿主检查，检查`npm pack`分发内容。当前成品`.mjs`无需安装时构建；检查是否通过由本轮实际记录填写。
3. 所有公开结构变更同步契约及说明，真实调用者与取消边界保留，升级不清理个人设置；版本／文件／校验／公开链接一致。
4. 当前固件真实时间过期、普通重启、原生登记LAN和Codex语音链路按其范围记录；16实体仅1项，其他15、Wi-Fi／掉电及完整恢复仍暂停，不因插件测试变为通过。
5. 当前take为released4940ms，不宣称同次自动五秒或完整80,000帧。用户反馈与同boot遥测分开保存。
6. 继续保留BSL-1.1、第三方代码／字典／字体／素材来源、对应源码和RELINK；核对独立素材再分发范围。公开包不能包含NVS、整机备份、Wi-Fi密码、账号密码、Token、API Key或原始日志。

`package.json`的private阻止误发npm，不影响本地目录或GitHub安装。把本地源码改好并不自动升级已安装快照，也不会重刷M5。

## 云端目录材料草稿

在Studio「插件中心」选择「提交插件」，人工核对当时已公开的插件仓库HTTPS根地址、版本及材料，再提交审核；不自动发布，也不代用户确认新信任。

名称：`M5Stack Cardputer-Adv`

描述草稿：

```text
M5Stack Cardputer-Adv 的 Ekko Studio 设备管理与固件配套插件。使用官方 SDK v1 查看原生 MCU 状态，按账号和 Profile 保存管理入口，并提供可校验应用、对应源码和中文安装指南。M5 直接使用 Studio 原生聊天协议，不修改电脑后端，不增加桥接。

alpha6 保留16 Agent目录、Studio模型／原生CLI、中文输入、历史和最多五秒的无SD RAM录音。只供已有本项目精确8MiB双固件布局更新，不支持新机首刷、跨网远程或插件内USB／OTA刷写。部分Agent和恢复场景尚未完成实机验收；当前本地候选须先完成本版插件验证与发布材料核对。SDK来源为官方0.8.23对应提交，兼容宿主基线为官方0.8.24；素材和许可限制见包内声明。
```

旧alpha5的公开根地址安装与官方宿主成功记录保留在[验证记录](VALIDATION.zh-CN.md)，不能移作本版通过。本阶段只准备和本地检查，不声称云端目录已上架。
