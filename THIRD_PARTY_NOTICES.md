# 来源与许可

插件由 Ekko Studio 的官方生成器创建，SDK 固定来源提交 `80d57ddffe3105b3ffadf4cedc0b995ef3951d0f`，对应参考版本 0.8.23；当前兼容宿主基线为官方 0.8.24。复制的 SDK、harness、开发指南和模板遵循原上游 [LICENSE](LICENSE) 中的 BSL-1.1、EKKOLearnAI 署名、附加使用授权、变更日期与变更许可。修改的设备管理代码不为上游另行授予 MIT 或 Apache 许可。商业使用须按原条款取得所需授权。

当前alpha.6应用对应源码快照为 `thursdaycapital/ekko-cardputer-adv-stock-lan` 的 `a78fc66b7b57b06cd1de8dd990d633d0b497fda7`。alpha.6固件Release仍为草稿，应用使用固定公开提交raw文件，对应源码归档随插件提供并核对SHA。旧alpha.5公开Release与r2归档记录仅作历史。未引入私人完整Flash、NVS、认证数据或原始日志。本插件不重新分发原厂独立应用。

`firmware/source.tar.gz` 包含该提交 `source/` 下的完整已跟踪文件；解压后保留原目录关系，包括 Arduino ESP32 2.0.17 对应源码、固定构建配置、字典、字体、头像、启动视频的来源材料及各组件许可。上游根许可不替代 LGPL、MIT、Apache、CC0、字体许可或其他第三方条款。详细内容见解压后的 `source/THIRD_PARTY_NOTICES.md`、`source/licenses/`、`source/assets/` 及 [重新链接说明](firmware/RELINK.md)。源码包 SHA-256 见 `firmware/SHA256SUMS.txt`。

保留 Arduino 核心和库的修改、替换、重新链接及调试这些修改所需的权利，不另加限制。工具链和全部构建工具不随包附送，重建可能需要下载固定依赖，也不承诺二进制逐字节复现。

头像使用品牌原始 SVG／PNG 来源，部分素材独立再分发授权尚未完整确立；商标归各权利人，源码许可不等于商标许可。启动视频来自用户提供的素材，其原 Remotion 工程保留 `private` / `UNLICENSED` 元数据。公开分享指令及此前公开来源不自动为视频内每项第三方品牌内容建立许可。正式审核前应核对素材授权，或改为有明确可再分发授权的素材。本预览不作已全部清权的承诺。


USB升级驱动参考同作者thursdaycapital的StackChan插件提交feb63b0c2e13e2a37327b454c3f6f1a8e458345a的Node串口适配与作业设计。该原提交标为UNLICENSED，公开不等于开放复用许可；本次按作者用户指令适配为Cardputer的8MiB应用更新、私人备份和保留区域核对，不把原StackChan项目整体重新许可，不包含其CoreS3镜像或Pulse配对。新增依赖@serialport/bindings-cpp 13.0.1与@serialport/stream 13.0.0遵循MIT，esptool-js 0.7.1遵循Apache-2.0；安装依赖时保留各包LICENSE及原声明。
