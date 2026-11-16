// Self-contained client: only the official SDK bridge crosses the iframe boundary.
const labels = {
  zh: {
    title: 'M5Stack Cardputer-Adv', eyebrow: 'CARDPUTER ADV', subtitle: '用实体键盘与语音，连接你的 AI Agent。',
    devices: '设备', firmware: '固件', guide: '使用说明', preferences: '偏好设置', loading: '正在读取 Studio…', retry: '重试', failed: '读取失败', refresh: '刷新设备',
    registered: '设备列表', deviceIntro: '按设备名称或设备码末六位，选择你的 Cardputer-Adv。', empty: '还没有连接设备', emptyHelp: '先按使用说明完成首次绑定，再回来刷新。',
    nativeManage: '打开原生设备管理', name: '设备名称', suffix: '设备码末六位', lan: '局域网', relay: '电脑中继', channel: '登记渠道', connected: '已连接', disconnected: '未连接', official: '官方', unofficial: '非官方',
    relayNote: 'M5 和 Studio 需要连接同一局域网。当前固件不支持跨网远程。',
    select: '选择设备', none: '暂不选择', savedDevice: '已保存的设备', modelNote: '选择要在此工作台管理的设备。', missingDevice: '已保存的设备不在当前列表中；可保留选择，或手动改选。',
    settingsIntro: '保存设备管理地址和默认设备，设置用于当前账号及 Profile。',
    origin: 'M5 设备地址', originHint: '使用 M5 显示的局域网根地址或 .local 主机名；可留空。不填写账号、密码或路径。', originPlaceholder: 'http://设备的局域网地址',
    save: '保存设置', saveSelection: '保存设备选择', saving: '正在保存…', cancel: '撤销修改', saved: '设置已保存', cancelled: '已恢复上次保存的内容', saveFailed: '保存失败，修改仍保留在表单中。',
    nativeTitle: '连接与管理', nativePage: '设备原生管理页', noOrigin: '尚未保存设备地址。请在偏好设置填写 M5 当前的局域网地址。', nativeHint: '复制地址到浏览器打开。首次使用时选择电脑，登录 Studio 并选择 Profile；以后会自动连接。',
    selectText: '选中文本', selected: '已选中，请按 Ctrl/Cmd+C 手动复制。', copyHint: '地址和校验值可选中复制，在独立浏览器或终端中使用。',
    validatedFirmware: '固件升级', existingOnly: '仅适用于既有双固件布局', noFirstFlash: '用于已安装本项目兼容双固件的 Cardputer-Adv。新设备或分区布局不明时，请先查看安装说明。', firmwareIntro: '通过 USB 更新 EkkoStudio，保留原厂工具与设备设置。升级前会自动保存私有整机备份。', advanced: '高级与开源信息', preview: '预览版', openSourceNote: '完整固件源码、第三方许可与重新链接说明随安装包提供。使用与分发请遵守对应许可。', relinkUrl: '重新链接说明',
    usbTitle: 'USB 固件升级', usbHostHint: '把 M5 的数据线接到运行 Studio 的电脑。使用 NAS 版 Studio 时，请将数据线接到 NAS。', usbChecking: '正在检查服务端 USB 能力…', usbUnavailable: '当前服务端无法使用 USB 升级。', usbPlatform: '连接平台', usbErrorCode: '诊断代码', usbScan: '扫描 USB 设备', usbScanning: '正在扫描…', usbPort: 'USB 设备', usbChoose: '请选择扫描到的设备', usbNoPorts: '没有发现可用 USB 设备，请检查数据线与下载模式后重新扫描。', usbBoard: '我确认这是 M5Stack Cardputer-Adv、8MiB Flash，且已安装本项目兼容的双固件布局。', usbStart: '升级固件', usbConfirming: '等待确认…', usbSubmitting: '正在提交…', usbRefresh: '刷新任务状态', usbRefreshing: '正在查询…', usbCancel: '取消任务', usbCancelling: '正在取消…', usbProgress: 'USB 升级进度', usbUnknown: '提交结果未确认。不会自动重试；请先刷新任务状态，核对是否已开始，再决定是否手动重试。', usbNoJob: '未发现已提交的任务。可重新确认后手动提交。', usbPollPaused: '页面观察已暂停，任务可能仍在运行。请刷新任务状态继续查询；关闭页面不会取消任务。', usbCloseHint: '关闭页面不会取消任务。只有安全阶段允许取消；写入开始后不要拔线或关机。', usbComplete: '固件升级完成，原厂工具和设置已保留。', usbNeedsCheck: '任务已结束，但校验记录不完整，请核对设备和任务结果。', usbLaunch: '请在 M5 原厂菜单选择 EkkoStudio，按 OK 进入。', usbResultUnknown: '设备结果尚未确认，请保持连接并核对任务和设备；不要直接重复刷写。', usbBackup: '本机私有完整备份', usbAppCheck: '应用校验', usbRegionsCheck: '原厂与设置区域校验', usbYes: '已完成', usbNotYet: '未确认', usbConfirmSafety: '仅更新 Ekko 应用，原厂工具和设备设置会保留。升级前自动在本机保存私有完整备份，并在写入后核对。中断不会自动回滚，写入后不能取消。确认继续？', usbCancelFailed: '取消结果未确认，请刷新任务状态。', usbFailureUnknown: '未收到具体错误原因。请保留连接，查看高级信息中的诊断代码。',
    usbPhases: { queued: '已排队', opening: '正在打开设备', checking: '正在检查设备和布局', 'backing-up': '正在备份', writing: '正在写入', verifying: '正在读回校验', restarting: '正在复位', completed: '任务结束', failed: '任务失败', cancelled: '任务已取消' },
    usbRecheck: '重新核对并扫描', usbRechecking: '等待重新核对…', usbRecheckSafety: '上次更新的设备结果仍未知。请先检查设备状态和数据线，确认本机私有备份已保留，并按教程使 M5 进入 G0 下载模式。此操作只重新扫描，不恢复旧任务、不自动重试；之后仍需再次确认才能刷写，无法确认关闭的 USB 锁也不会绕过。继续重新核对并扫描？', usbPreviousUnknown: '上次更新结果仍未知，已由你明确选择重新核对。私有备份仍保留；重新扫描或再次刷写不会证明上次结果正常。', usbDuration: '升级期间请保持设备连接和 Studio 运行。完整备份与读回需要几分钟，慢速连接耗时更长。', usbPortExpiry: '扫描结果两分钟有效，过期请重新扫描。',
    version: '版本', file: '文件', bytes: '字节', size: '文件大小', offset: '写入偏移', partition: '应用分区大小', hash: 'SHA-256', downloadUrl: '公开固定下载地址', sourceUrl: '源码地址', releaseUrl: '发布页地址',
    sourceBundled: '完整固件源码随安装包提供。', sourceHash: '源码 SHA-256', sourceDownload: '源码下载地址',
    guideIntro: '完成一次绑定，就能在 M5 上打字或说话，与电脑上的 Agent 对话。', firstPairing: '三步开始使用',
    step1: '已有兼容固件可直接使用。需要更新时，按安装教程先备份并核对布局，只更新 Ekko 应用并读回校验，保留原厂与设置；新机不适用这个更新包。', step2: 'M5 与运行官方 Studio 的电脑连接同一 Wi-Fi。首次在独立浏览器打开 M5 显示的 /device 地址，选择电脑、登录并选 Profile；已有有效绑定可跳过。插件偏好只方便保存入口。', step3: '从原厂菜单进入 EkkoStudio，选择电脑上已经配置好的 Agent，按 OK 进入。直接打字、OK 发送，或按住 Fn＋空格说话，松开发送。',
    keyboard: '键盘速查', arrow: '方向键', arrowHelp: '在首页选择 Agent', ok: 'OK / 回车', okHelp: '进入聊天；输入时发送消息', esc: 'Esc', escHelp: '返回上一页；首页返回原厂菜单', tab: 'Tab', tabHelp: '切换历史浏览，再用方向键翻看记录', language: 'Ctrl + Space', languageHelp: '切换中文 / 英文输入', voice: 'Fn + Space', voiceHelp: '按住说话，松开发送；单次最长 5 秒，无需 SD 卡',
    history: 'Fn + 上 / 下', historyHelp: '聊天页直接翻看记录，不需要先切换浏览模式', modeHelp: '首页选择并保存 Studio模型／原生CLI；聊天页仍切换历史浏览', boot: 'G0', bootHelp: '聊天页短按返回首页；首页短按回原厂，长按说话',
    scope: '使用前确认', agentNote: '选择已在 Studio 配置好的 Agent。使用 CLI Agent 前，请先在电脑上完成安装和授权。电脑需要保持开机，Studio 保持运行。', scopeNote: 'M5 与 Studio 需要连接同一局域网，当前固件不支持跨网远程。设备管理网页请仅在可信局域网内使用。', unknownView: '此视图不存在，请选择上方导航。',
  },
  en: {
    title: 'M5Stack Cardputer-Adv', eyebrow: 'CARDPUTER ADV', subtitle: 'Your AI Agents, with a physical keyboard and voice.',
    devices: 'Devices', firmware: 'Firmware', guide: 'Guide', preferences: 'Preferences', loading: 'Reading Studio…', retry: 'Retry', failed: 'Could not load', refresh: 'Refresh devices',
    registered: 'Devices', deviceIntro: 'Find your Cardputer-Adv by its name or the last six characters of its device code.', empty: 'No devices yet', emptyHelp: 'Follow the guide to pair your device, then refresh.',
    nativeManage: 'Open native device management', name: 'Device name', suffix: 'Last six code characters', lan: 'LAN', relay: 'Desktop relay', channel: 'Registration channel', connected: 'Connected', disconnected: 'Disconnected', official: 'Official', unofficial: 'Unofficial',
    relayNote: 'The M5 and Studio must share a local network. Remote access is not supported by this firmware.',
    select: 'Select device', none: 'No selection', savedDevice: 'Saved device', modelNote: 'Choose the device you want to manage here.', missingDevice: 'The saved device is absent from this list. Keep the selection or choose another manually.',
    settingsIntro: 'Save a device address and preferred device for your current account and Profile.',
    origin: 'M5 device address', originHint: 'Use the LAN root address shown by the M5, or a .local hostname. May be empty. Do not include credentials or a path.', originPlaceholder: 'http://device-lan-address',
    save: 'Save preferences', saveSelection: 'Save device selection', saving: 'Saving…', cancel: 'Discard changes', saved: 'Preferences saved', cancelled: 'Restored the last saved values', saveFailed: 'Save failed. Your changes remain in the form.',
    nativeTitle: 'Connect and manage', nativePage: 'Native device management page', noOrigin: 'No device address is saved. Enter the M5’s current LAN address in Preferences.', nativeHint: 'Copy the address into your browser. For first pairing, choose your computer, sign in to Studio and select a Profile. Saved pairings reconnect automatically.',
    selectText: 'Select text', selected: 'Selected. Press Ctrl/Cmd+C to copy manually.', copyHint: 'Select and copy addresses or checksums for use in a separate browser or terminal.',
    validatedFirmware: 'Firmware update', existingOnly: 'Existing dual-firmware layout only', noFirstFlash: 'For Cardputer-Adv devices with this project’s compatible dual firmware already installed. Read the installation guide first for a new device or an unknown layout.', firmwareIntro: 'Update EkkoStudio over USB while preserving factory tools and device settings. A private full backup is saved before the update.', advanced: 'Advanced and open-source information', preview: 'Preview', openSourceNote: 'Complete firmware source, third-party licenses and relinking instructions are included in the package. Follow the respective licenses when using or distributing them.', relinkUrl: 'Relinking instructions',
    usbTitle: 'USB firmware update', usbHostHint: 'Connect the M5 data cable to the computer running Studio. If Studio runs on a NAS, connect the cable to the NAS.', usbChecking: 'Checking server USB support…', usbUnavailable: 'USB updates are unavailable on this server.', usbPlatform: 'Connection platform', usbErrorCode: 'Diagnostic code', usbScan: 'Scan USB devices', usbScanning: 'Scanning…', usbPort: 'USB device', usbChoose: 'Choose a scanned device', usbNoPorts: 'No usable USB devices found. Check the data cable and download mode, then scan again.', usbBoard: 'I confirm this is an M5Stack Cardputer-Adv with 8MiB Flash and this project’s compatible dual-firmware layout already installed.', usbStart: 'Update firmware', usbConfirming: 'Awaiting confirmation…', usbSubmitting: 'Submitting…', usbRefresh: 'Refresh update status', usbRefreshing: 'Checking…', usbCancel: 'Cancel update', usbCancelling: 'Cancelling…', usbProgress: 'USB update progress', usbUnknown: 'Submission result is unknown. Nothing will be retried automatically. Refresh update status to check whether it started before manually retrying.', usbNoJob: 'No submitted update was found. You may confirm again and submit manually.', usbPollPaused: 'Page monitoring has paused; the update may still be running. Refresh its status to continue. Closing this page does not cancel it.', usbCloseHint: 'Closing this page does not cancel the update. Cancellation is allowed only during safe phases. Do not unplug or power off once writing starts.', usbComplete: 'Firmware updated. Factory tools and settings were preserved.', usbNeedsCheck: 'The update ended, but verification records are incomplete. Check the device and update result.', usbLaunch: 'Select EkkoStudio in the M5 factory menu, then press OK to open it.', usbResultUnknown: 'The device result is not confirmed. Keep it connected and check the update and device before attempting another flash.', usbBackup: 'Private full backup on this server', usbAppCheck: 'Application verification', usbRegionsCheck: 'Factory and settings verification', usbYes: 'Complete', usbNotYet: 'Unconfirmed', usbConfirmSafety: 'Only the Ekko application will be updated. Factory tools and device settings are preserved. A private full backup is saved on this computer before writing, and the result is verified afterwards. Interruption does not trigger automatic rollback. Cancellation is unavailable after writing begins. Continue?', usbCancelFailed: 'Cancellation result is unknown. Refresh update status.', usbFailureUnknown: 'No specific error reason was received. Keep the device connected and check the diagnostic code under Advanced information.',
    usbPhases: { queued: 'Queued', opening: 'Opening device', checking: 'Checking device and layout', 'backing-up': 'Backing up', writing: 'Writing', verifying: 'Verifying readback', restarting: 'Resetting', completed: 'Update ended', failed: 'Update failed', cancelled: 'Update cancelled' },
    usbRecheck: 'Recheck and scan again', usbRechecking: 'Awaiting recheck…', usbRecheckSafety: 'The previous device result is still unknown. Check the device and data cable, confirm that the private backup is retained, and follow the guide to put the M5 into G0 download mode. This only rescans; it does not resume or retry the old update. Flashing requires another confirmation, and an unconfirmed USB-close lock is not bypassed. Recheck and scan again?', usbPreviousUnknown: 'The previous result remains unknown. You explicitly chose to recheck it. The private backup is retained; rescanning or flashing again does not prove that the previous result was correct.', usbDuration: 'Keep the device connected and Studio running. Full backup and readback take a few minutes; slow connections may take longer.', usbPortExpiry: 'Scan results are valid for two minutes. Scan again after they expire.',
    version: 'Version', file: 'File', bytes: 'bytes', size: 'File size', offset: 'Flash offset', partition: 'Application partition size', hash: 'SHA-256', downloadUrl: 'Fixed public download URL', sourceUrl: 'Source URL', releaseUrl: 'Release page URL',
    sourceBundled: 'Complete firmware source is included in the package.', sourceHash: 'Source SHA-256', sourceDownload: 'Source download URL',
    guideIntro: 'Pair once, then type or speak on your M5 to chat with the Agents on your computer.', firstPairing: 'Start in three steps',
    step1: 'Use the existing compatible firmware, or follow the installation guide to back up, verify the layout, update only the Ekko app, and read it back. Factory firmware and settings are preserved. This update is not for a blank device.', step2: 'Join the same Wi-Fi as the computer running official Studio. For first pairing, open the M5 /device address in a separate browser, choose the computer, sign in, and select a Profile. Skip this with a valid saved binding. Plugin preferences only save the shortcut.', step3: 'Open EkkoStudio from the factory menu, choose an Agent configured on the computer, and press OK. Type and press OK to send, or hold Fn + Space to speak and release to send.',
    keyboard: 'Keyboard reference', arrow: 'Arrow keys', arrowHelp: 'Choose an Agent on the home page', ok: 'OK / Enter', okHelp: 'Open chat; send while composing', esc: 'Esc', escHelp: 'Return; from home, return to the factory menu', tab: 'Tab', tabHelp: 'Switch to history browsing; use arrows to read earlier messages', language: 'Ctrl + Space', languageHelp: 'Switch Chinese / English input', voice: 'Fn + Space', voiceHelp: 'Hold to speak, release to send; up to 5 seconds. No SD card needed.',
    history: 'Fn + Up / Down', historyHelp: 'Scroll chat history directly, without entering a separate browsing mode', modeHelp: 'Choose and save Studio model / Native CLI on home; in chat, switch history browsing', boot: 'G0', bootHelp: 'Short press returns from chat to home, then to the factory menu; hold to speak',
    scope: 'Before you start', agentNote: 'Choose an Agent already configured in Studio. Install and authorize CLI Agents on your computer first. Keep the computer powered on and Studio running.', scopeNote: 'The M5 and Studio must share a local network. Remote access is not supported by this firmware. Use the device management page only on a trusted local network.', unknownView: 'Unknown view. Choose a view above.',
  },
}

function rpcErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error)
  // Studio wraps a rejected RPC as "API Error <HTTP status>: <reason>".
  // Keep unknown errors intact, including status-only and non-leading occurrences.
  return /^API Error [45]\d{2}:\s*(\S[\s\S]*)$/.exec(message)?.[1] ?? message
}

const css = `
.adv [hidden]{display:none!important}
.adv{box-sizing:border-box;max-width:1120px;margin:auto;padding:28px clamp(16px,4vw,48px) 44px;color:var(--text-primary);font-family:var(--font-family,inherit);font-size:var(--font-size-base,14px);line-height:var(--line-height,1.6);letter-spacing:var(--letter-spacing,normal)}
.adv *{box-sizing:border-box}.adv h1,.adv h2,.adv h3,.adv p{margin:0}.adv h1{font-size:clamp(23px,3vw,35px);line-height:1.15;font-weight:650;letter-spacing:-.025em}.adv h2{font-size:20px;font-weight:650}.adv h3{font-size:16px}.adv-eyebrow{font-size:10px;letter-spacing:.14em;font-weight:600;color:var(--text-muted);margin-bottom:12px!important}.adv-subtitle,.adv-note{color:var(--text-secondary);max-width:80ch;margin-top:12px!important}.adv-note{font-size:.94em}
.adv-identity{display:flex;align-items:center;gap:20px}.adv-identity>div{min-width:0}.adv-product-image{width:104px;height:104px;object-fit:contain;flex:none}.adv-nav{display:flex;gap:8px;flex-wrap:wrap;border-bottom:1px solid var(--border-color);padding-top:24px;margin-bottom:28px}.adv button,.adv input,.adv select,.adv textarea{font:inherit;color:inherit}.adv button{cursor:pointer}.adv button:disabled{opacity:.5;cursor:wait}.adv button:focus-visible,.adv input:focus-visible,.adv select:focus-visible,.adv textarea:focus-visible{outline:2px solid var(--accent-primary);outline-offset:3px}.adv-nav button{border:0;border-bottom:3px solid transparent;background:none;border-radius:0;padding:10px 12px;color:var(--text-secondary)}.adv-nav button[aria-current=page]{color:var(--text-primary);border-bottom-color:var(--accent-primary);font-weight:650}
.adv-button{padding:8px 13px;min-height:var(--control-height,36px);border:var(--border-width,1px) solid var(--theme-input-border,var(--border-color));border-radius:var(--theme-input-radius,var(--radius-component,6px));background:var(--theme-input-bg,var(--bg-input));box-shadow:var(--theme-input-shadow,none)}.adv-primary{border-color:var(--accent-primary)}.adv-actions{display:flex;gap:9px;flex-wrap:wrap;align-items:center;margin-top:18px}.adv-section{padding:24px 0;border-bottom:1px solid var(--border-light,var(--border-color))}.adv-section:first-child{padding-top:0}.adv-toolbar{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap}.adv-toolbar p{max-width:68ch;color:var(--text-secondary)}
.adv-table{overflow-x:auto;margin-top:20px}.adv table{width:100%;border-collapse:collapse;text-align:left;font-size:.94em}.adv th{font-size:.84em;font-weight:600;color:var(--text-muted);padding:9px 12px;border-bottom:1px solid var(--border-color);white-space:nowrap}.adv td{padding:15px 12px;border-bottom:1px solid var(--border-light,var(--border-color));vertical-align:top;overflow-wrap:anywhere}.adv td:first-child{min-width:140px;max-width:260px}.adv td:first-child,.adv th:first-child{padding-left:0}.adv-state{display:inline-flex;gap:7px;align-items:center;white-space:nowrap;color:var(--text-secondary)}.adv-state:before{content:'';width:6px;height:6px;border-radius:50%;background:var(--text-muted);flex:none}.adv-state[data-online=true]:before{background:var(--success)}
.adv-form{display:grid;gap:20px;max-width:680px;margin-top:22px}.adv-field{display:grid;gap:7px;min-width:0}.adv-field label{display:grid;gap:7px;font-weight:600}.adv-field small{color:var(--text-secondary);line-height:1.5}.adv-input{min-width:0;width:100%;min-height:var(--control-height,38px);padding:9px 11px;background:var(--theme-input-bg,var(--bg-input));border:var(--border-width,1px) solid var(--theme-input-border,var(--border-color));border-radius:var(--theme-input-radius,var(--radius-component,6px));box-shadow:var(--theme-input-shadow,none);backdrop-filter:var(--theme-input-filter,none)}.adv-status{margin-top:12px!important;overflow-wrap:anywhere}.adv-status[data-level=error]{color:var(--error)}.adv-status[data-level=success]{color:var(--success)}.adv-status[data-level=info]{color:var(--text-secondary)}
.adv-copy{margin-top:14px}.adv-copy label{display:block;font-weight:600}.adv-copy-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;align-items:start;margin-top:7px}.adv-copy textarea{resize:vertical;min-height:44px;line-height:1.5;font-weight:400;font-size:.91em;overflow-wrap:anywhere;word-break:break-all}.adv-callout{border-left:3px solid var(--warning);padding:12px 16px;background:var(--theme-overlay-bg,var(--bg-secondary));border-radius:0 var(--theme-overlay-radius,var(--radius-component,6px)) var(--theme-overlay-radius,var(--radius-component,6px)) 0;box-shadow:var(--theme-overlay-shadow,none);backdrop-filter:var(--theme-overlay-filter,none);margin:18px 0}.adv-callout strong{display:block;margin-bottom:4px}.adv-callout p{color:var(--text-secondary)}
.adv-firmware{background:var(--theme-card-bg,var(--bg-card));border:var(--border-width,1px) solid var(--theme-card-border,var(--border-color));border-radius:var(--theme-card-radius,var(--radius-component,6px));box-shadow:var(--theme-card-shadow,none);backdrop-filter:var(--theme-card-filter,none);padding:20px;margin-top:20px}.adv dl{display:grid;grid-template-columns:minmax(110px,170px) minmax(0,1fr);gap:10px 18px;margin:18px 0}.adv dt{color:var(--text-muted)}.adv dd{margin:0;overflow-wrap:anywhere}.adv-version{font-size:17px;font-weight:650;overflow-wrap:anywhere}.adv ol{padding-left:23px}.adv li+li{margin-top:12px}.adv kbd{display:inline-block;padding:3px 7px;border:1px solid var(--theme-input-border,var(--border-color));border-bottom-width:2px;border-radius:4px;background:var(--theme-input-bg,var(--bg-input));font:inherit;font-size:.9em;color:var(--text-primary)}.adv-empty{padding:28px 0}.adv-empty h3{margin-bottom:8px}.adv-loading{padding:28px 0;color:var(--text-secondary)}.adv-pulse{display:inline-block;width:8px;height:8px;background:var(--accent-primary);margin-right:9px;animation:adv-pulse 1.3s ease-in-out infinite}@keyframes adv-pulse{50%{opacity:.25}}@media(prefers-reduced-motion:reduce){.adv-pulse{animation:none}}
.adv-advanced{margin-top:28px;border-top:1px solid var(--border-light,var(--border-color));padding-top:18px}.adv-advanced summary{cursor:pointer;font-weight:600;padding:6px 0;color:var(--text-secondary);transition:color .18s ease}.adv-advanced summary:hover{color:var(--text-primary)}.adv-advanced summary:focus-visible{outline:2px solid var(--accent-primary);outline-offset:4px}.adv-advanced[open] summary{color:var(--text-primary)}
.adv-usb{margin-top:24px;padding:24px 0;border-top:1px solid var(--border-light,var(--border-color))}.adv-usb-confirm{display:flex!important;align-items:flex-start;gap:10px;font-weight:400!important}.adv-usb-confirm input{flex:none;margin-top:5px}.adv-usb progress{display:block;width:100%;max-width:680px;height:12px;margin-top:16px;accent-color:var(--accent-primary)}.adv-usb-job{overflow-wrap:anywhere}
@media(max-width:620px){.adv{padding-top:20px}.adv-identity{gap:14px}.adv-product-image{width:64px;height:64px}.adv dl{grid-template-columns:1fr;gap:3px}.adv dd{margin-bottom:10px}.adv-firmware{padding:15px}.adv-copy-row{grid-template-columns:minmax(0,1fr)}.adv-copy-row button{justify-self:start}.adv-keys{grid-template-columns:120px minmax(0,1fr)!important;gap:15px!important}.adv table,.adv tbody{display:block}.adv thead{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}.adv tbody tr{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px 16px;padding:16px 0;border-bottom:1px solid var(--border-light,var(--border-color))}.adv td{display:grid;gap:4px;padding:0;border:0;min-width:0}.adv td:first-child{grid-column:1/-1;min-width:0;max-width:none}.adv td:before{content:attr(data-label);font-size:.84em;color:var(--text-muted)}}
`

/** @param {HTMLElement} root @param {import('@ekko-studio/plugin-sdk').ClientContext} ctx */
export async function mount(root, ctx) {
  const doc = root.ownerDocument
  const t = labels[!ctx.locale || ctx.locale.toLowerCase().startsWith('zh') ? 'zh' : 'en']
  let alive = !ctx.signal.aborted
  let generation = 0
  const removers = new Set()
  const pageRemovers = new Set()
  let bindingRemovers = []
  let pagePhase = false
  let stopUsb = () => {}
  const el = (tag, text, className) => {
    const node = doc.createElement(tag)
    if (text !== undefined) node.textContent = text
    if (className) node.className = className
    return node
  }
  const listen = (node, event, handler) => {
    node.addEventListener(event, handler)
    const bucket = pagePhase ? pageRemovers : removers
    const remove = () => { node.removeEventListener(event, handler); bucket.delete(remove) }
    bucket.add(remove)
    return remove
  }
  const button = (text, handler, primary = false) => {
    const node = el('button', text, `adv-button${primary ? ' adv-primary' : ''}`)
    node.type = 'button'
    listen(node, 'click', handler)
    return node
  }
  const scope = el('div', undefined, 'adv')
  const style = el('style', css)
  const content = el('div', undefined, 'adv-content')
  content.setAttribute('aria-live', 'polite')
  const dispose = () => {
    if (!alive) return
    alive = false
    generation++
    stopUsb()
    for (const remove of [...removers, ...pageRemovers]) remove()
    bindingRemovers = []
    scope.remove()
    style.remove()
    ctx.signal.removeEventListener('abort', dispose)
  }
  if (!alive) return dispose
  ctx.signal.addEventListener('abort', dispose, { once: true })
  ctx.lifecycle.add(dispose)
  const header = el('header'), identity = el('div', undefined, 'adv-identity')
  const icon = ctx.plugin?.icon
  // The host resolves package assets. Never request a remote or arbitrary URL.
  if (typeof icon === 'string' && icon.length <= 350000 && /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/u.test(icon)) {
    const image = el('img', undefined, 'adv-product-image')
    image.alt = t.title
    image.width = image.height = 104
    image.decoding = 'async'
    listen(image, 'error', () => image.remove())
    image.src = icon
    identity.append(image)
  }
  const heading = el('div')
  heading.append(el('p', t.eyebrow, 'adv-eyebrow'), el('h1', t.title), el('p', t.subtitle, 'adv-subtitle'))
  identity.append(heading)
  header.append(identity)
  const nav = el('nav', undefined, 'adv-nav')
  nav.setAttribute('aria-label', 'Cardputer-Adv')
  for (const view of ['devices', 'firmware', 'guide', 'preferences']) {
    const item = button(t[view], () => {
      if (!alive) return
      const base = view === 'preferences' ? '/studio/plugin-settings' : '/studio/plugins'
      ctx.ui.navigate(`${base}/m5stack-cardputer-adv/${view}`)
    })
    if (view === ctx.view) item.setAttribute('aria-current', 'page')
    nav.append(item)
  }
  scope.append(header, nav, content)
  root.append(style, scope)
  pagePhase = true
  const status = (parent, text = '', level = 'info') => {
    const node = el('p', text, 'adv-status')
    node.dataset.level = level
    node.setAttribute('role', level === 'error' ? 'alert' : 'status')
    parent.append(node)
    return node
  }
  const section = (title) => {
    const node = el('section', undefined, 'adv-section')
    node.append(el('h2', title))
    content.append(node)
    return node
  }
  const copyField = (parent, label, value, localRemovers) => {
    const field = el('div', undefined, 'adv-copy')
    const caption = el('label', label)
    const row = el('div', undefined, 'adv-copy-row')
    const input = el('textarea', undefined, 'adv-input')
    input.readOnly = true
    input.rows = value.length > 110 ? 3 : 2
    input.value = value
    input.setAttribute('aria-label', label)
    caption.append(input)
    const message = el('p', '', 'adv-status')
    message.setAttribute('role', 'status')
    const select = el('button', t.selectText, 'adv-button')
    select.type = 'button'
    const remove = listen(select, 'click', () => {
      if (!alive) return
      input.focus()
      input.select()
      message.textContent = t.selected
    })
    if (localRemovers) localRemovers.push(remove)
    row.append(caption, select)
    field.append(row, message)
    parent.append(field)
  }
  const binding = (settings) => {
    for (const remove of bindingRemovers) remove()
    bindingRemovers = []
    content.querySelector('[data-binding]')?.remove()
    const node = section(t.nativeTitle)
    node.dataset.binding = 'true'
    if (settings.deviceOrigin) copyField(node, t.nativePage, `${settings.deviceOrigin}/device`, bindingRemovers)
    else node.append(el('p', t.noOrigin, 'adv-note'))
    node.append(el('p', t.nativeHint, 'adv-note'))
  }
  function settingsForm(parent, devices, initial, withOrigin) {
    let saved = { deviceOrigin: initial.deviceOrigin, preferredDeviceId: initial.preferredDeviceId }
    let busy = false
    // The host grants allow-scripts, not allow-forms. Saving is an explicit SDK action.
    const form = el('div', undefined, 'adv-form')
    form.setAttribute('role', 'group')
    form.setAttribute('aria-label', withOrigin ? t.preferences : t.select)
    let origin
    if (withOrigin) {
      const field = el('div', undefined, 'adv-field')
      const label = el('label', t.origin)
      origin = el('input', undefined, 'adv-input')
      Object.assign(origin, { type: 'text', autocomplete: 'off', spellcheck: false, placeholder: t.originPlaceholder, value: saved.deviceOrigin })
      label.append(origin)
      field.append(label, el('small', t.originHint))
      form.append(field)
    }
    const field = el('div', undefined, 'adv-field')
    const label = el('label', t.select)
    const select = el('select', undefined, 'adv-input')
    const none = el('option', t.none)
    none.value = ''
    select.append(none)
    for (const device of devices) {
      const option = el('option', `${device.name} · …${device.codeSuffix}`)
      option.value = device.id
      select.append(option)
    }
    if (saved.preferredDeviceId && !devices.some(device => device.id === saved.preferredDeviceId)) {
      const option = el('option', `${t.savedDevice} (${saved.preferredDeviceId})`)
      option.value = saved.preferredDeviceId
      select.append(option)
      field.append(el('small', t.missingDevice))
    }
    select.value = saved.preferredDeviceId
    label.append(select)
    field.prepend(label)
    field.append(el('small', t.modelNote))
    const actions = el('div', undefined, 'adv-actions')
    const save = button(withOrigin ? t.save : t.saveSelection, () => {}, true)
    const cancel = button(t.cancel, () => {
      if (!alive || busy) return
      if (origin) origin.value = saved.deviceOrigin
      select.value = saved.preferredDeviceId
      message.textContent = t.cancelled
      message.dataset.level = 'info'
      message.setAttribute('role', 'status')
    })
    actions.append(save, cancel)
    form.append(field, actions)
    const message = status(form)
    if (origin) listen(origin, 'keydown', event => {
      if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); save.click() }
    })
    listen(save, 'click', async event => {
      event.preventDefault()
      if (!alive || busy) return
      busy = true
      save.disabled = cancel.disabled = select.disabled = true
      if (origin) origin.disabled = true
      save.textContent = t.saving
      message.textContent = ''
      const next = { deviceOrigin: origin ? origin.value.trim() : saved.deviceOrigin, preferredDeviceId: select.value }
      const request = generation
      try {
        await ctx.rpc.call('save-settings', next)
        if (!alive || request !== generation) return
        saved = { ...next, deviceOrigin: next.deviceOrigin ? new URL(next.deviceOrigin).origin : '' }
        if (origin) origin.value = saved.deviceOrigin
        message.textContent = t.saved
        message.dataset.level = 'success'
        message.setAttribute('role', 'status')
        // Refresh only the displayed native URL, not the native device itself.
        binding(saved)
      } catch (error) {
        if (!alive || request !== generation) return
        message.textContent = `${t.saveFailed} ${rpcErrorMessage(error)}`
        message.dataset.level = 'error'
        message.setAttribute('role', 'alert')
      } finally {
        if (alive && request === generation) {
          busy = false
          save.disabled = cancel.disabled = select.disabled = false
          if (origin) origin.disabled = false
          save.textContent = withOrigin ? t.save : t.saveSelection
        }
      }
    })
    parent.append(form)
  }
  function renderDevices(listing, settings) {
    const top = section(t.registered)
    const toolbar = el('div', undefined, 'adv-toolbar')
    toolbar.append(el('p', t.deviceIntro), button(t.refresh, load))
    top.append(toolbar)
    if (!listing.devices.length) {
      const empty = el('div', undefined, 'adv-empty')
      empty.append(el('h3', t.empty), el('p', t.emptyHelp, 'adv-note'))
      top.append(empty)
    } else {
      const wrap = el('div', undefined, 'adv-table')
      const table = el('table')
      const head = el('thead'), headings = el('tr'), body = el('tbody')
      for (const heading of [t.name, t.suffix, t.lan]) headings.append(el('th', heading))
      head.append(headings)
      for (const device of listing.devices) {
        const row = el('tr')
        row.append(el('td', device.name), el('td', `…${device.codeSuffix}`))
        for (const online of [device.lanConnected]) {
          const cell = el('td'), state = el('span', online ? t.connected : t.disconnected, 'adv-state')
          state.dataset.online = String(online)
          cell.append(state)
          row.append(cell)
        }
        ;[t.name, t.suffix, t.lan].forEach((label, index) => { row.children[index].dataset.label = label })
        body.append(row)
      }
      table.append(head, body)
      wrap.append(table)
      top.append(wrap)
    }
    top.append(el('p', t.relayNote, 'adv-note'))
    const actions = el('div', undefined, 'adv-actions')
    actions.append(button(t.nativeManage, () => { if (alive) ctx.ui.navigate('/hermes/connections?tab=mcu') }))
    top.append(actions)
    settingsForm(top, listing.devices, settings, false)
    binding(settings)
  }
  async function renderUsb(overview, parent, diagnostics) {
    const request = generation
    const panel = el('section', undefined, 'adv-usb')
    panel.append(el('h3', t.usbTitle))
    parent.append(panel)
    panel.append(el('p', t.usbHostHint, 'adv-note'), el('p', t.usbDuration, 'adv-note'))
    const host = el('dd', '—'), errorCode = el('dd', '—')
    diagnostics.append(el('dt', t.usbPlatform), host, el('dt', t.usbErrorCode), errorCode)
    const form = el('div', undefined, 'adv-form')
    const field = el('div', undefined, 'adv-field'), portLabel = el('label', t.usbPort)
    const ports = el('select', undefined, 'adv-input')
    ports.setAttribute('aria-label', t.usbPort)
    portLabel.append(ports)
    field.append(portLabel, el('small', t.usbPortExpiry))
    const boardLabel = el('label', undefined, 'adv-usb-confirm')
    const board = el('input')
    board.type = 'checkbox'
    boardLabel.append(board, doc.createTextNode(t.usbBoard))
    form.append(field, boardLabel)
    const actions = el('div', undefined, 'adv-actions')
    const scan = button(t.usbScan, scanPorts)
    const start = button(t.usbStart, startUpdate, true)
    const refresh = button(t.usbRefresh, () => refreshInfo(true))
    const cancel = button(t.usbCancel, cancelUpdate)
    const recheck = button(t.usbRecheck, recheckAndScan)
    actions.append(scan, start, refresh, cancel, recheck)
    form.append(actions)
    panel.append(form)
    const notice = status(panel, t.usbChecking)
    const previousUnknown = status(panel)
    previousUnknown.hidden = true
    const progress = el('progress')
    progress.max = 100
    progress.value = 0
    progress.setAttribute('aria-label', t.usbProgress)
    const details = el('div', undefined, 'adv-usb-job')
    panel.append(progress, details, el('p', t.usbCloseHint, 'adv-note'))
    let info = null, job = null, busy = false, unknown = false, checking = true
    let reviewedUnknownJobId = ''
    let selectedPorts = [], timer = null, stopped = false, pollEpoch = 0, polls = 0, deadline = 0
    const current = () => alive && !stopped && request === generation
    const terminal = () => job && ['completed', 'failed', 'cancelled'].includes(job.phase)
    const active = () => job && !terminal()
    const stopPolling = () => { clearTimeout(timer); timer = null; ++pollEpoch }
    stopUsb = () => { stopped = true; stopPolling() }
    const message = (text, level = 'info') => {
      notice.textContent = text
      notice.dataset.level = level
      notice.setAttribute('role', level === 'error' ? 'alert' : 'status')
    }
    function controls() {
      const needsReview = job?.resultUnknown === true && reviewedUnknownJobId !== job.id
      const locked = busy || checking || active() || unknown || needsReview
      scan.disabled = locked || info?.available !== true
      ports.disabled = locked || !selectedPorts.length || info?.available !== true
      board.disabled = locked || info?.available !== true
      start.disabled = locked || info?.available !== true || !board.checked || !selectedPorts.some(port => port.id === ports.value)
      refresh.hidden = !job && !unknown && (checking || info?.available === true)
      refresh.disabled = busy || checking
      if (!checking) refresh.textContent = job || unknown || info?.available === true ? t.usbRefresh : t.retry
      cancel.hidden = !active() || job.canCancel !== true
      cancel.disabled = busy || checking || !active() || job.canCancel !== true
      recheck.hidden = job?.resultUnknown !== true
      recheck.disabled = busy || checking || unknown || !terminal() || job.resultUnknown !== true || info?.available !== true
    }
    function renderJob() {
      details.replaceChildren()
      progress.hidden = !job
      errorCode.textContent = job?.errorCode || '—'
      if (!job) return
      const percent = Math.max(0, Math.min(100, Number.isFinite(job.progress) ? job.progress : 0))
      progress.value = percent
      const heading = `${t.usbPhases[job.phase] ?? job.phase} · ${percent}%`
      details.append(el('p', heading, 'adv-status'))
      if (['failed', 'cancelled'].includes(job.phase) && job.message) details.append(el('p', job.message, 'adv-note'))
      else if (job.phase === 'failed') details.append(el('p', t.usbFailureUnknown, 'adv-note'))
      const checks = el('dl')
      for (const [key, label] of [['backupSaved', t.usbBackup], ['applicationVerified', t.usbAppCheck], ['preservedRegionsVerified', t.usbRegionsCheck]]) {
        checks.append(el('dt', label), el('dd', job[key] === true ? t.usbYes : t.usbNotYet))
      }
      details.append(checks)
      if (job.resultUnknown === true) message(t.usbResultUnknown, 'error')
      else if (job.phase === 'completed') {
        const verified = job.backupSaved === true && job.applicationVerified === true && job.preservedRegionsVerified === true
        message(verified ? t.usbComplete : t.usbNeedsCheck, verified ? 'success' : 'error')
        details.append(el('p', t.usbLaunch, 'adv-note'))
      } else if (job.phase === 'failed') message(t.usbPhases.failed, 'error')
      else if (job.phase === 'cancelled') message(t.usbPhases.cancelled)
      else if (info?.available === true) message('')
    }
    function setPorts(list) {
      const previous = ports.value
      selectedPorts = list
      ports.replaceChildren()
      const empty = el('option', t.usbChoose)
      empty.value = ''
      ports.append(empty)
      for (const port of list) {
        const option = el('option', port.label)
        option.value = port.id
        ports.append(option)
      }
      ports.value = list.some(port => port.id === previous) ? previous : ''
    }
    function observe(resetBudget = false) {
      stopPolling()
      if (!current() || !active()) return
      if (resetBudget) { deadline = Date.now() + 10 * 60_000; polls = 0 }
      if (polls >= 300 || Date.now() >= deadline) { message(t.usbPollPaused); return }
      const epoch = pollEpoch
      timer = setTimeout(async () => {
        timer = null
        if (!current() || epoch !== pollEpoch || !active()) return
        if (Date.now() >= deadline) { message(t.usbPollPaused); return }
        const id = job.id
        try {
          ++polls
          const next = await ctx.rpc.call('usb-update-status', { jobId: id })
          if (!current() || epoch !== pollEpoch || job?.id !== id) return
          job = next
          renderJob()
          controls()
          observe()
        } catch (error) {
          if (!current() || epoch !== pollEpoch) return
          message(`${t.usbPollPaused} ${rpcErrorMessage(error)}`, 'error')
        }
      }, 2000)
    }
    async function refreshInfo(explicit = false) {
      if (!current() || busy) return
      stopPolling()
      checking = true
      refresh.textContent = t.usbRefreshing
      controls()
      try {
        const next = await ctx.rpc.call('usb-info', null)
        if (!current()) return
        info = next
        job = info.currentJob ?? null
        unknown = false
        host.textContent = info.hostPlatform
        message(info.available === true ? (explicit && !job ? t.usbNoJob : '') : `${t.usbUnavailable}${info.reason ? ` ${info.reason}` : ''}`, info.available === true ? 'info' : 'error')
        renderJob()
        observe(true)
      } catch (error) {
        if (current()) message(`${rpcErrorMessage(error)}${unknown ? ` ${t.usbUnknown}` : ''}`, 'error')
      } finally {
        if (current()) { checking = false; refresh.textContent = t.usbRefresh; controls() }
      }
    }
    async function scanPorts() {
      if (!current() || scan.disabled || busy) return
      busy = true
      scan.textContent = t.usbScanning
      controls()
      try {
        await readPorts()
      } catch (error) {
        if (current()) { setPorts([]); message(rpcErrorMessage(error), 'error') }
      } finally {
        if (current()) { busy = false; scan.textContent = t.usbScan; controls() }
      }
    }
    async function readPorts() {
      const response = await ctx.rpc.call('usb-list-ports', null)
      if (!current()) return
      setPorts(response.ports)
      if (job?.resultUnknown === true) renderJob()
      else message(response.ports.length ? '' : t.usbNoPorts)
      if (!response.ports.length && job?.resultUnknown === true) message(`${t.usbResultUnknown} ${t.usbNoPorts}`, 'error')
    }
    async function recheckAndScan() {
      if (!current() || recheck.disabled || busy) return
      busy = true
      recheck.textContent = t.usbRechecking
      controls()
      try {
        const reviewedId = job.id
        const confirmed = await ctx.ui.confirm(t.usbRecheckSafety)
        if (!current() || !confirmed || job.id !== reviewedId) return
        reviewedUnknownJobId = reviewedId
        board.checked = false
        setPorts([])
        previousUnknown.hidden = false
        previousUnknown.textContent = t.usbPreviousUnknown
        recheck.textContent = t.usbScanning
        await readPorts()
      } catch (error) {
        if (current()) { setPorts([]); message(`${t.usbResultUnknown} ${rpcErrorMessage(error)}`, 'error') }
      } finally {
        if (current()) { busy = false; recheck.textContent = t.usbRecheck; controls() }
      }
    }
    async function startUpdate() {
      if (!current() || start.disabled || busy) return
      busy = true
      start.textContent = t.usbConfirming
      controls()
      const file = overview.firmware.files[0]
      let submitted = false
      try {
        const confirmed = await ctx.ui.confirm(`${t.title}\n${t.version}: ${overview.firmware.releaseLabel}\n\n${t.usbConfirmSafety}`)
        if (!current() || !confirmed) return
        const input = { portId: ports.value, requestId: globalThis.crypto.randomUUID(), firmwareSha256: file.sha256, boardConfirmed: true }
        submitted = true
        start.textContent = t.usbSubmitting
        message(t.usbSubmitting)
        const next = await ctx.rpc.call('usb-start-update', input)
        if (!current()) return
        job = next
        unknown = false
        renderJob()
        observe(true)
      } catch (error) {
        if (!current()) return
        unknown = submitted
        message(`${submitted ? `${t.usbUnknown} ` : ''}${rpcErrorMessage(error)}`, 'error')
      } finally {
        if (current()) { busy = false; start.textContent = t.usbStart; controls() }
      }
    }
    async function cancelUpdate() {
      if (!current() || cancel.disabled || busy) return
      busy = true
      cancel.textContent = t.usbCancelling
      stopPolling()
      controls()
      try {
        const next = await ctx.rpc.call('usb-cancel-update', { jobId: job.id })
        if (!current()) return
        job = next
        renderJob()
        observe(true)
      } catch (error) {
        if (current()) message(`${t.usbCancelFailed} ${rpcErrorMessage(error)}`, 'error')
      } finally {
        if (current()) { busy = false; cancel.textContent = t.usbCancel; controls() }
      }
    }
    setPorts([])
    listen(ports, 'change', controls)
    listen(board, 'change', controls)
    controls()
    await refreshInfo()
  }
  async function renderFirmware(overview) {
    const top = section(t.validatedFirmware)
    const caution = el('div', undefined, 'adv-callout')
    caution.append(el('strong', t.existingOnly), el('p', t.noFirstFlash))
    top.append(caution, el('p', t.firmwareIntro, 'adv-note'))
    const fw = overview.firmware
    top.append(el('p', `${t.version} ${fw.releaseLabel}${fw.stage === 'development-preview' ? ` · ${t.preview}` : ''}`, 'adv-version'))
    // Optional technical information stays available without interrupting updates.
    const advanced = el('details', undefined, 'adv-advanced')
    advanced.append(el('summary', t.advanced), el('p', t.openSourceNote, 'adv-note'))
    const diagnostics = el('dl')
    const usbReady = renderUsb(overview, top, diagnostics)
    const metadata = el('dl')
    metadata.append(el('dt', t.version), el('dd', fw.version))
    advanced.append(metadata)
    for (const file of fw.files) {
      const pane = el('article', undefined, 'adv-firmware')
      pane.append(el('h3', file.path))
      const dl = el('dl')
      for (const [label, value] of [[t.offset, `0x${file.offset.toString(16)}`], [t.size, `${file.bytes.toLocaleString()} ${t.bytes}`], [t.partition, `0x${fw.applicationPartitionBytes.toString(16)} · ${fw.applicationPartitionBytes.toLocaleString()} ${t.bytes}`]]) dl.append(el('dt', label), el('dd', value))
      pane.append(dl)
      copyField(pane, t.hash, file.sha256)
      copyField(pane, t.downloadUrl, file.downloadUrl)
      advanced.append(pane)
    }
    advanced.append(el('p', t.copyHint, 'adv-note'))
    copyField(advanced, t.sourceUrl, fw.source.url)
    copyField(advanced, t.relinkUrl, fw.source.relinkUrl)
    if (fw.source.releaseUrl && fw.publication !== 'draft') copyField(advanced, t.releaseUrl, fw.source.releaseUrl)
    if (fw.source.archive) {
      advanced.append(el('p', t.sourceBundled, 'adv-note'))
      copyField(advanced, t.sourceHash, fw.source.archive.sha256)
      if (fw.source.archive.downloadUrl) copyField(advanced, t.sourceDownload, fw.source.archive.downloadUrl)
    }
    advanced.append(diagnostics)
    top.append(advanced)
    await usbReady
  }
  function renderGuide(overview) {
    content.append(el('p', t.guideIntro, 'adv-note'))
    const first = section(t.firstPairing), steps = el('ol')
    for (const key of ['step1', 'step2', 'step3']) steps.append(el('li', t[key]))
    first.append(steps)
    const keys = section(t.keyboard), dl = el('dl', undefined, 'adv-keys')
    const controls = [['arrow', 'arrowHelp'], ['ok', 'okHelp'], ['esc', 'escHelp'],
      ['tab', overview.capabilities.explicitAgentModes ? 'modeHelp' : 'tabHelp'],
      ['history', 'historyHelp'], ['language', 'languageHelp'], ['voice', 'voiceHelp']]
    if (overview.capabilities.shortG0Returns) controls.push(['boot', 'bootHelp'])
    for (const [key, help] of controls) {
      const dt = el('dt')
      dt.append(el('kbd', t[key]))
      dl.append(dt, el('dd', t[help]))
    }
    keys.append(dl)
    const scope = section(t.scope)
    scope.append(el('p', t.agentNote, 'adv-note'), el('p', t.scopeNote, 'adv-note'))
  }
  async function load() {
    if (!alive) return
    const request = ++generation
    stopUsb()
    for (const remove of [...pageRemovers]) remove()
    bindingRemovers = []
    content.replaceChildren()
    if (!['devices', 'preferences', 'firmware', 'guide'].includes(ctx.view)) { content.append(el('p', t.unknownView)); return }
    const loading = el('p', undefined, 'adv-loading')
    loading.append(el('span', '', 'adv-pulse'), doc.createTextNode(t.loading))
    content.append(loading)
    try {
      if (ctx.view === 'firmware' || ctx.view === 'guide') {
        const overview = await ctx.rpc.call('get-overview', null)
        if (!alive || request !== generation) return
        content.replaceChildren()
        if (ctx.view === 'guide') renderGuide(overview)
        else await renderFirmware(overview)
      } else {
        const [listing, settings] = await Promise.all([ctx.rpc.call('list-devices', null), ctx.rpc.call('get-settings', null)])
        if (!alive || request !== generation) return
        content.replaceChildren()
        if (ctx.view === 'devices') renderDevices(listing, settings)
        else {
          const top = section(t.preferences)
          top.append(el('p', t.settingsIntro, 'adv-note'))
          settingsForm(top, listing.devices, settings, true)
          binding(settings)
        }
      }
    } catch (error) {
      if (!alive || request !== generation) return
      content.replaceChildren()
      const pane = section(t.failed)
      status(pane, rpcErrorMessage(error), 'error')
      pane.append(button(t.retry, load))
    }
  }
  await load()
  return dispose
}
