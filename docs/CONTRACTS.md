# Cardputer-Adv 数据契约与边界

`contracts/plugin.json` 是公开 RPC、宿主返回和持久化格式的唯一字段定义，使用随官方模板提供的 `assertContracts`、`registerRpc`、`validateModel`。输入、输出、读取的设置、写入的设置及固件清单均实际经过校验；未声明的公开操作、输入字段和输出字段不被接受。服务端入口只导出官方 `apply(ctx)`，不引用 Studio 内部模块。

## 设备管理与固件概览 RPC

| RPC | 输入模型 | 输出模型 | 行为 |
| --- | --- | --- | --- |
| `get-overview` | `empty`，即 `null` | `overview` | 读取包内 `firmware/release.json` 并验证应用镜像；不访问网络或设备。 |
| `list-devices` | `empty` | `devices` | 使用本次调用的 `run.host.request('/api/mcu-devices')` 读取官方登记列表。 |
| `get-settings` | `empty` | `settings` | 读取当前真实用户及 Profile 偏好；未存储时返回两个空字符串。 |
| `save-settings` | `settings` | `saved` | 校验并替换当前真实用户及 Profile 偏好，成功返回 `{ "ok": true }`。 |

`settings` 仅包含 `deviceOrigin` 和 `preferredDeviceId`。`deviceOrigin` 允许空值，或 HTTP(S) 私有 IPv4（10/8、172.16/12、192.168/16）和合法 `.local` 名称的根 origin，可含有效端口；末尾 `/`、默认端口及主机大小写按 URL origin 规范化。不允许凭据、其他路径、查询、片段、公网地址、loopback、IPv6、非标准 IPv4 写法或控制字符。`.local` 只是地址偏好，不是对 DNS 结果或网络安全性的保证；插件不会解析、探测或访问它。`preferredDeviceId` 最长 128 字符，可为空，不接受控制字符。

所有 RPC 必须具有真实 `run.identity`：`userId` 是正安全整数，`profile` 是非空白、无控制字符且不超过 256 字符的字符串，同时必须具有未取消的 `run.signal`。不借用激活插件的账号、Profile 或 `ctx.host` 权限。

## 官方设备列表

官方原形状使用 `nativeDevices` 校验：顶层 `devices` 数组，每条记录必须含整数 `id`、字符串 `name`/`device_code`、布尔 `is_official`/`lan_connected`/`remote_connected` 和整数 `created_at`；最多 1000 条，重复 ID 视为无效。未知的 JSON 字段可从宿主读取，但立即丢弃，不向前端透传，不存储，不记录日志。宿主错误不含原始响应体地向调用者报告，不伪装成空列表。

输出固定为：

```json
{
  "devices": [{
    "id": "7",
    "name": "用户登记名称",
    "codeSuffix": "123456",
    "lanConnected": true,
    "desktopRelayConnected": false,
    "official": false
  }],
  "modelVerified": false
}
```

`codeSuffix` 只保留设备码末六字符。名称和渠道标记原样来自官方接口，不用于猜测型号、把非官方设备改为官方或规避官方认证。`desktopRelayConnected` 仅表示电脑的中继客户端连接；它不证明 M5 跨网聊天可用。官方 MCU 登记列表是宿主提供的全局设备列表，不是按本插件用户/Profile 隔离的硬件清单；插件沿用官方账号权限并明确标注 `modelVerified:false`。

## 只读固件概览

`overview` 等于清单的 `release` 模型再加 `artifactVerified:true`。清单包含 `board`、`capabilities`、`pluginSdk`、单个 `firmware` 对象；`firmware.files` 只有一个应用更新镜像。所有具体字段、解释及边界见契约。

版本、镜像文件名、长度、SHA 与验证记录都来自本次捆绑清单；运行时和测试不把某个版本的固定长度当作通用值。板型和已有双固件布局限制仍是安全边界，不能仅更改元数据把陌生布局当作支持。

`firmware.files[].downloadAsset` 是可选的 Release 应用资产 basename。填写时，`downloadUrl` 必须严格等于 `firmware.source.repository`、`releases/download`、`releaseLabel` 和此 basename 拼成的地址；只接受字母、数字、点、下划线、连字符与 `.bin` 后缀，不接受斜杠、查询或编码转义。`source.releaseUrl` 必须使用同仓库同标签；源码浏览和重新链接地址继续固定真实 `source.commit`。旧清单省略 `downloadAsset` 时仅接受同仓库、同完整提交的 raw 下载地址，不接受浮动分支。此校验验证本地材料与来源格式，不发网络请求，也不证明远端 Release 已存在。

`capabilities.explicitAgentModes`、`shortG0Returns` 是可选布尔字段，省略均等同 false。前者只在已验证首页显式切换 Studio模型／原生CLI 时声明；后者只在已验证短 G0 返回时声明。指南读取已经校验的 `get-overview`，按声明显示新版按键，不按版本号猜测。旧清单无需迁移；偏好存储结构和四个 RPC 不变。

返回前验证：

- 元数据及文件都在包内 `firmware/`，拒绝路径穿越、绝对路径、符号链接及特殊文件。
- 镜像长度、发布 SHA-256、ESP32-S3 芯片 ID、8MiB Flash 头、段边界、Espressif XOR checksum 和附加 SHA-256 摘要完整匹配。
- 应用只允许偏移 `0x10000`、长度不超过 `0x330000`，原厂应用从 `0x340000` 开始；不输出本机绝对路径。
- 下载链接是固定完整 40 位源码提交的公开 GitHub raw HTTPS 地址；源码浏览和重新连接说明也固定同一提交。插件不下载、不代理、不把固件字节或 Base64 放进 RPC。

`artifactVerified` 表示本次包内校验通过，并不表示探测过设备分区、执行过刷写、验证过硬件型号或在当前宿主上完成实机验收。该应用更新需要已有兼容分区布局，不能用来首次初始化空白设备；get-overview只验证包内材料。只有用户明确发起USB更新后，后端才读取真实Flash并校验分区表；详情见下方USB作业。`stage` 固定为 `development-preview`，不得称为稳定版。

`pluginSdk` 分开记录官方 API/SDK 提交及检查的宿主版本；`firmwareOnThisHostPhysicallyValidated` 是按真实材料填写的布尔值，不再固定 false。true 仅表示该固件在声明宿主上的已记录实测，不自动意味着全 Agent 或故障矩阵通过；主机测试不能将其改为 true。`firmware.validation` 分别记录文字／语音版本及各项确认范围：目录有 16 Agent 不等于全部 Agent 实机通过，用户确认五秒自动停止不等于已抓到完整五秒字节计数，`fullMatrixComplete:false` 不得省略。跨网远程不在这个局域网交付的支持承诺内。

## 存储、取消与释放

记录位于 `ctx.state.plugin.namespace(String(run.identity.userId), run.identity.profile)` 的 `settings` 键。版本 1；默认 `{ "deviceOrigin": "", "preferredDeviceId": "" }`。这个独立插件没有旧版本存量迁移；官方模板示例中的 `greeting/compact` 不兼容，若碰到非本插件的旧记录则报错，不静默覆盖。只有记录不存在（`undefined`）才采用默认值，坏记录或 `null` 均拒绝。

操作在开始时和异步读取之后检查取消信号；保存会在解析、取命名空间后、调用 `set` 前再次检查，已取消的调用不发起写入。官方 SDK 的 `PluginStorage.set` 没有 signal 或事务撤回参数：若取消发生在已经交给宿主的写入中，不能保证撤回这次原子写入，返回会报告取消，用户可重新读取确认最终状态。文档不把这个 SDK 边界伪装成完整事务取消。

`apply` 返回幂等释放函数，反向释放全部 RPC，并等待已创建USB作业管理器释放原生资源；注册中途失败也清理此前注册。重复 `apply` 由官方重复注册约束拒绝，不覆盖已有 handler。释放后的残留 handler 拒绝新调用。插件不注册HTTP入口、模型烧录工具、计划任务或聊天桥接。USB页面只观察明确提交的作业；后端作业归插件生命周期，不依赖某次RPC结束后的run上下文。

## 检查范围

`tests/backend.test.mjs` 覆盖真实调用者/Profile 隔离、非法身份与输入、取消、坏存储、URL 限制、官方响应裁剪与错误、释放及重复加载、实际包内固件、篡改、路径穿越、符号链接及错误脱敏。`tests/contracts.test.mjs` 验证实际九个 RPC 与共享存储模型；`tests/usb-*.test.mjs`覆盖驱动和更新作业的离线故障矩阵。以上属于主机测试，不是 Cardputer-Adv 实机测试。

`firmware.source.archive` 可选对象声明对应源码归档的 `path`、`bytes`、`sha256`、`downloadAsset`、`downloadUrl`。源码下载同样必须使用来源仓库和 releaseLabel 的精确 `.tar.gz` basename；本地归档必须是 firmware/ 内普通文件，大小和 SHA 一致。省略保持旧清单兼容。后端不展开归档、不执行构建、不从网络获取材料；该 SHA 校验不代替独立的源码对应性与许可审核。

## alpha.6 的草稿与源码分发

`firmware.publication` 可选，值为 `draft` 或 `published`；省略保持旧清单的 `published` 语义。正式发布清单必须包含同仓库、同标签的 `source.releaseUrl`。草稿可以省略它；若填写仍执行同样校验，前端不展示草稿的发布页链接。应用 `downloadUrl` 仍必填，并固定到已公开源码提交，不指向需要登录才能取回的 Release 草稿。

源码归档 `path/bytes/sha256` 保持必填并校验实际文件；`downloadAsset` 与 `downloadUrl` 改为成对可选。二者均省略时，源码仅随插件包提供，页面展示包内路径和摘要；只填一项、空字符串或 null 均拒绝。提供外链时仍执行原先的仓库、标签和资产名限制。此变更该历史变更不增加权限、RPC、HTTP服务或设备操作，不改变设置存储。

`validation` 新增可选布尔字段 `tokenExpiryRecovery`、`studioRestartRecovery`、`fiveSecondAutoStopObserved`、`testsPaused`，及 0～16 的 `physicalAgentCount`。这些字段仅表达已保存的当前固件实测范围，省略时不显示新状态；不从目录数量、插件页面检查或固件版本推断通过。用户反馈自动停止与同轮自动截止日志分别记录。alpha.6 当前仅 Codex 实体路由已有证据，其余测试暂停；`allAgentsPhysicallyValidated` 和 `fullMatrixComplete` 保持 false。


## 0.3 USB应用升级

新增五个声明并实际校验的UI RPC：

| RPC | 输入 | 输出 | 行为 |
|---|---|---|---|
| usb-info | empty | usbInfo | 加载服务端原生依赖，返回平台/可用原因及本账号Profile已有currentJob；不枚举或打开串口。 |
| usb-list-ports | empty | usbPorts | 明确扫描服务端USB，缓存最多32个opaque选择ID，两分钟有效，不打开端口。 |
| usb-start-update | usbStartInput | usbJob | 确认型号和精确随包SHA后，备份/核布局/应用更新/完整读回。 |
| usb-update-status | usbJobInput | usbJob | 查询本调用者作业，不重试写入。 |
| usb-cancel-update | usbJobInput | usbJob | 只在写入开始前取消并等待释放；写入后返回真实作业状态，不中断写入。 |

USB入口只接受真实`run.identity.surface=ui`、当前账号/Profile及`api.write`，与旧四个读取/偏好RPC的检查分开。不接受模型工具调用、激活者身份、手填设备路径、任意固件文件或下载地址。`boardConfirmed:true`只能在用户确认M5Stack Cardputer-Adv、8MiB和既有双固件布局后提交。前端使用官方`ctx.ui.confirm`展示固件版本、SHA、备份和更新范围，再生成一次requestId；同实例、记录保留期内相同用户/Profile/requestId去重，不因超时自动重刷，不宣称跨Studio重启持久幂等。扫描结果两分钟有效。型号勾选不构成自动硬件识别。

驱动延迟加载Node串口与esptool-js，USB在运行Studio服务的主机，不一定在浏览器电脑。`available=true`只说明真实组件加载通过，端口权限/存在/目标布局仍需后续实际核对。扫描不打开串口；写前及原生打开后再次核同一强USB身份，ROM读取芯片/MAC，容量必须精确8MiB。在上游main进入stub前核真实安全信息，安全启动、任何非零加密计数、未知或矛盾状态均拒绝；不写eFuse，已有stub需重新进ROM模式。不能把其他ESP32-S3或16MiB CoreS3当作本目标。

只读随包已校验的alpha6应用，服务端再次核其实际SHA。进入ROM后先读完整8MiB，按SDK可信`ctx.paths.dataDir`建立私有`usb-backups`记录，目录0700、备份和元数据0600，持久化并读回核对；备份包含个人设置，不通过RPC、日志或插件安装包传输。真实分区表`0x8000`起3072B必须匹配当前发布清单的布局SHA，否则零写入。只能在`0x10000`更新不超过`0x330000`的应用；不能调用擦除整片或从0地址安装。

写完再读完整8MiB，实际应用段匹配新镜像，前缀`[0,0x10000)`及尾部`[0x340000,0x800000)`逐字节匹配备份。应用分区中镜像末尾所在擦除扇区允许擦除，不把未使用应用槽当作保留区。全部校验后才请求复位，`completed`只证明写入和保留区域校验，不证明已进入Ekko、正常对话或听到声音；用户从原厂菜单进入Ekko。

作业只保留普通身份/受控参数及自身取消信号，离开页面不自动取消已确认的刷写；前端重新挂载可从usb-info恢复活动作业，否则返回最近保留的终态。普通终态20分钟过期，未确认的未知结果不静默过期；新扫描、新requestId和新确认才可取代旧未知警示，最多保留64条作业。真实物理USB有进程共享锁，跨插件快照重载也不得绕过；关闭未确认时poison锁，不能假报释放。写入后禁用用户取消，但90分钟总期限或插件释放可强停并标为结果未知；写后校验失败也保留备份及错误，不自动重试/回滚。页面10分钟暂停轮询只影响观察。断电后不能依赖内存中的作业状态恢复运行，备份保留用于人工核对。

后端在apply阶段捕获插件根signal及稳定paths后再惰性创建USB管理器。官方PluginContext.signal在RPC内会指向当前调用，不能到RPC中才订阅，否则一次查询结束就会误取消长期作业。返回disposer同步注销全部入口，再等待所有同步/异步清理；重复释放复用同一Promise，错误只返回固定说明。

`usbJob`所有字段的含义见契约声明；不包含原始串口内容、ROM MAC、凭据或私人路径。`backupSaved`、`applicationVerified`和`preservedRegionsVerified`必须由实际操作设置，不能由进度100推断。取消不保证回滚，resetConfirmed也不等于应用启动确认。
