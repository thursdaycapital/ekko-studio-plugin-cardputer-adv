/** Fixed messages only: native/esptool errors and abort reasons stay private. */
const messages = Object.freeze({
  USB_CANCELLED: 'USB 操作已取消。',
  USB_TIMEOUT: 'USB 操作超时，请检查连接后重试。',
  USB_DEPENDENCY_UNAVAILABLE: 'USB 串口组件不可用，请检查插件依赖和系统支持。',
  USB_IO: 'USB 串口通信失败，请检查设备、驱动和权限。',
  USB_CLOSED: 'USB 串口已关闭或设备已断开。',
  USB_CLOSE_UNCONFIRMED: '无法确认 USB 原生串口已关闭，请检查连接后再操作。',
  USB_IDENTITY_UNAVAILABLE: '串口缺少可核对的 USB 硬件身份，未打开设备。',
  USB_IDENTITY_CHANGED: 'USB 设备身份已变化，未继续操作。',
  USB_ROM_IDENTITY: '无法读取并核对设备的真实 ROM 身份，未继续操作。',
  USB_CHIP_MISMATCH: '仅支持 ESP32-S3，未继续操作。',
  USB_FLASH_SIZE: '仅支持实际容量为 8MiB 的 Flash，未继续操作。',
  USB_SECURITY_UNSUPPORTED: '设备启用了不支持的安全保护，或无法确认安全状态，未继续操作。',
  USB_BUSY: 'USB 会话正在执行另一项操作。',
  USB_PROTOCOL: 'USB 设备回复格式或长度不符合预期。',
  USB_INVALID_RANGE: 'Flash 读取范围或应用写入长度无效。',
  USB_VERIFY_FAILED: '应用写入校验未通过，请保留备份并检查设备。',
})

export class UsbSerialError extends Error {
  constructor(code) {
    const safe = Object.hasOwn(messages, code) ? code : 'USB_IO'
    super(messages[safe])
    this.name = 'UsbSerialError'
    this.code = safe
    this.resultUnknown = ['USB_CANCELLED', 'USB_TIMEOUT', 'USB_IO', 'USB_CLOSED',
      'USB_CLOSE_UNCONFIRMED', 'USB_VERIFY_FAILED'].includes(safe)
  }
}

export const usbError = code => new UsbSerialError(code)
