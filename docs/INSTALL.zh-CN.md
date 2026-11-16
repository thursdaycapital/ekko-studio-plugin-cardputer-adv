# 安装插件、更新已有固件与首次绑定

当前本地候选为插件 `0.3.0-alpha.1` / 固件 `cardputer-adv-v10.0.0-alpha.6`。应用 3,321,072 B、SHA `9208e53b8336523b50a3d49ce5a18f559f9aa79a885bef6df2deaf201c930230`，源码随包归档 10,104,056 B、SHA `dedf8d3dfb27b5c55ecfb2f8bdda018dbae2ae5e5f670fa7de810d08f81d72e0`。应用外链固定到公开提交 `a78fc66b7b57b06cd1de8dd990d633d0b497fda7`；alpha6 Release 仍为草稿，不提供其公共下载或伪造源码下载。本版新增USB更新作业，验证以[检查记录](VALIDATION.zh-CN.md)为准；旧插件验证不代表新USB写入或实体矩阵通过。

普通使用先看[三步教程](QUICKSTART.zh-CN.md)。插件为可选管理入口，设备直连与聊天不依赖安装它。已有兼容布局可用[USB更新界面](USB_UPDATE.zh-CN.md)，以下命令保留作人工更新与校验参考。

## 1. 安装电脑插件

把完整插件候选目录放到运行Studio的机器。本地目录安装只复制目录，先在该目录准备生产依赖：Git克隆包含package-lock.json时运行`npm ci --ignore-scripts --omit=dev`；npm分发包解压后没有lock则运行`npm install --ignore-scripts --omit=dev`。不要在已安装的快照内改文件。然后打开「插件中心」，按本地绝对目录流程确认信任并启用。默认不会自动加入主导航；从插件详情打开，或在头像菜单「导航栏设置」添加Cardputer-Adv。

入口已为成品JavaScript，不需要安装时构建。官方GitHub/npm安装分支会安装生产依赖；本地目录安装不会代装依赖。Node串口依赖携带平台预编译组件，缺少匹配组件时页面会报告USB不可用，不自动编译或改Studio。安装及打开页面不自动操作设备。用户在固件页明确确认后才能更新应用，不修改Studio核心或Agent配置。

应用可从固件页复制固定公开提交的 raw 地址，在外部浏览器下载并核 SHA；iframe 内没有下载或 USB 权限。`firmware/source.tar.gz` 已随插件包附带，暂无独立公开的 alpha6 源码归档下载。为运行以下命令，应解压完整插件分发包并在其根目录操作，确认 `firmware/` 内文件存在；不要对安装中正在使用的宿主目录进行改写。

## 2. 固件安装前提

只更新**已有本项目精确 8MiB 双固件布局**的 M5Stack Cardputer-Adv。新买设备、其他固件布局或无法核对分区表者停在这里；本包不提供首刷整机镜像。固件文件不能写到 0x0，不能整片擦除，也不刷文件系统。

以下为 macOS / Linux 命令，需先安装 uv；固定 esptool 4.11.0。Windows 可在独立 Python 环境安装同版本 esptool，使用相同芯片、地址与备份 / 校验要求；不要直接照抄 Unix 端口与 shell 命令。

将设备电源置 OFF，按住顶部 G0 插 USB 数据线，两秒后松开。比较拔插前后的串口，只选随该设备变化的端口。命令应在项目根目录运行；用实际端口替换下一行的示例。

```sh
cardputer_port="/dev/cu.usbmodem实际端口"
cardputer_backup_ready=0
cardputer_private_dir="$(mktemp -d "$HOME/M5-private-backup.XXXXXXXX")"
```

备份目录在交付项目之外。完整 Flash 包含 Wi-Fi、登录数据，不能上传 GitHub 或与插件分享。

```sh
[ ! -e "$cardputer_private_dir/full-8MiB.bin" ] &&
uvx --from esptool==4.11.0 esptool.py --chip esp32s3 --port "$cardputer_port" --baud 460800 --before usb_reset --after no_reset read_flash 0x0 0x800000 "$cardputer_private_dir/full-8MiB.bin" &&
[ "$(wc -c < "$cardputer_private_dir/full-8MiB.bin")" -eq 8388608 ] &&
cardputer_backup_ready=1
```

任一步失败、非零退出或备份长度不符就停止。保留同一个终端窗口，读取分区表：

```sh
[ "${cardputer_backup_ready:-0}" -eq 1 ] &&
[ ! -e "${cardputer_private_dir:?请先完成备份}/partition-table.bin" ] &&
uvx --from esptool==4.11.0 esptool.py --chip esp32s3 --port "$cardputer_port" --baud 460800 --before no_reset --after no_reset read_flash 0x8000 0xC00 "$cardputer_private_dir/partition-table.bin"
```

以下整体执行；**不要只选最后一行**。要求备份、分区长度、精确布局及包内校验全部通过才写入：

```sh
[ "${cardputer_backup_ready:-0}" -eq 1 ] &&
[ "$(wc -c < "${cardputer_private_dir:?请先完成备份}/full-8MiB.bin")" -eq 8388608 ] &&
[ "$(wc -c < "$cardputer_private_dir/partition-table.bin")" -eq 3072 ] &&
[ "$(shasum -a 256 "$cardputer_private_dir/partition-table.bin" | cut -d ' ' -f 1)" = ca0c296c78733ef25a84d9077f534dc90adf32d510a9d6d0704e4b86a39ee479 ] &&
shasum -a 256 -c firmware/SHA256SUMS.txt &&
uvx --from esptool==4.11.0 esptool.py --chip esp32s3 --port "$cardputer_port" --baud 460800 --before no_reset --after no_reset write_flash 0x10000 firmware/ekko-stock-lan-update-0x10000.bin
```

应出现 `Hash of data verified`。仍保持下载模式，读回全部 Flash 到新的私人文件：

```sh
[ ! -e "$cardputer_private_dir/after-8MiB.bin" ] &&
uvx --from esptool==4.11.0 esptool.py --chip esp32s3 --port "$cardputer_port" --baud 460800 --before no_reset --after no_reset read_flash 0x0 0x800000 "$cardputer_private_dir/after-8MiB.bin"
```

在同一窗口执行比较。此时不要先启动正常固件，否则运行中的设置写入会影响比较：

```sh
python3 - "$cardputer_private_dir" <<'PY'
from pathlib import Path
import sys
private = Path(sys.argv[1])
before = (private / 'full-8MiB.bin').read_bytes()
after = (private / 'after-8MiB.bin').read_bytes()
app = Path('firmware/ekko-stock-lan-update-0x10000.bin').read_bytes()
assert len(before) == len(after) == 8388608, '整机备份或读回长度错误'
assert before[:0x10000] == after[:0x10000], '启动、配网或分区区域改变，停止'
assert before[0x340000:] == after[0x340000:], '原厂或存储区域改变，停止'
assert after[0x10000:0x10000 + len(app)] == app, '应用读回不一致，停止'
print('应用、原厂、配网与存储区域校验通过')
PY
```

全部通过再拔线、正常开机，从既有原厂菜单选择 EkkoStudio。此文档是操作指引，本次插件打包没有实际刷写设备。

## 3. 首次绑定与使用

1. M5 与 Studio 电脑连接同一可信 Wi-Fi。进入 M5 的 EkkoStudio。
2. 用同网手机或电脑浏览器打开 M5 显示的 `http://设备IP/device`。在原生管理页选择电脑，登录自己的 Studio 账号及允许的 Profile；发现不到时填写电脑的局域网地址和实际端口。
3. 插件「偏好」可选保存 M5 管理地址及选中设备。这里不会登录 M5，也不向固件写绑定；不使用插件也能完成原生绑定和聊天。
4. 原生绑定保存后通常无需每次输入；同一入口的令牌过期可自动恢复。电脑 IP／身份改变或授权被撤销时，按原生提示重新选择或绑定，不承诺自动迁移入口。
5. 选择已安装、授权并配置兼容模型的 Agent，OK 进入聊天。中文拼音需先选词或提交，之后 OK 才发送；新上下文默认中文。测试时可在空草稿／空拼音状态输入数字1并按OK。再 Fn＋空格短录，实际核对识别、回答和声音。

语音识别需要 Studio 的服务器端 STT 配置，TTS 也须已配置可用提供方。单次录音上限从采集就绪开始计时，不从刚按住 G0 开始计时；聊天语音不需要 SD 卡。当前已记录的take是松手4940ms，不作为同次自动五秒截止证据。16 项目录不等于全部 Agent 在每台电脑可用；当前实体矩阵只确认Codex一项，其余按用户要求暂停。

## 4. 键盘

| 按键 | 功能 |
| --- | --- |
| 左右键 | 首页浏览 Agent；历史模式翻阅 |
| OK | 进入聊天 / 发送；历史模式返回输入 |
| Esc | 聊天返回 Agent 首页；首页返回原厂菜单 |
| Ctrl＋空格 | 中文 / 英文切换 |
| 拼音＋空格 | 选中文候选词 |
| Tab | 首页切换 Studio模型／原生CLI；聊天页切换历史浏览与输入 |
| Fn＋空格 / 长 G0 | 按住录音，松开发送，五秒上限 |
| 短 G0 | 返回；首页返回原厂菜单 |
| Fn＋上下 | 直接翻阅聊天记录 |
| Fn＋R / Ctrl＋OK | 发送不确定时先核对记录，再确认已查看；不自动重发 |

新版交互只在捆绑清单明确声明后展示：`explicitAgentModes:true` 表示首页 Tab 切换 Studio模型／原生CLI；`shortG0Returns:true` 表示短 G0 返回、长 G0 说话。旧清单省略时保留原来的说明，不按版本号推断。实际固件版本、大小、SHA、布局与验收状态以「固件」页及 `firmware/release.json` 为准。

## 5. 回退

保留安装前私人完整备份。仅应用回退仍只写 Ekko 分区，先做当前完整备份、核对布局与旧版文件哈希，再按相同流程读回校验。旧版可能依赖电脑补丁，不因回刷自动恢复电脑配置。完整 Flash 恢复会覆盖之后的设置，不在插件里自动执行。不要将私人整机备份作为“通用固件”分享。
