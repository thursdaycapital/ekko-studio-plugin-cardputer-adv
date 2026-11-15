# 安装插件、更新已有固件与首次绑定

当前本地候选为插件 `0.2.0-alpha.5` / 固件 `cardputer-adv-v10.0.0-alpha.5`。固件应用及 r2 源码公开下载已验证，本版实机验收和插件仓库发布仍待完成；先核对包内 SHA 和验收状态，不把旧版结果当作当前应用通过。

普通使用先看[三步教程](QUICKSTART.zh-CN.md)。插件为可选管理入口，设备直连与聊天不依赖安装它。以下保留完整刷写校验步骤，不把界面简化称为自动刷写。

## 1. 安装电脑插件

解压完整交付包至运行 Studio 的机器。打开「插件中心」，使用本地绝对目录安装，按宿主要求确认信任，再启用。默认不会直接加入主导航；从插件详情进入，或在头像菜单的「导航栏设置」添加 Cardputer-Adv。

此插件的前后端已为可执行 JavaScript，安装不需要构建。它不会修改 Studio、Agent 配置或设备。若以后发布公开插件仓库，在中心填写该仓库根地址即可；当前固件来源仓库不是本插件安装源。

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
4. 原生绑定保存后通常无需每次输入。密码更改、授权撤销或会话过期按原生提示处理。
5. 选择已安装、授权并配置兼容模型的 Agent，OK 进入聊天。先打字发「你好」，再 Fn＋空格短录验证识别、回答和实际声音。

语音识别需要 Studio 的服务器端 STT 配置，TTS 也须已配置可用提供方。单次录音最多五秒；聊天语音不需要 SD 卡。16 项目录不等于全部 Agent 在每台电脑可用。

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
