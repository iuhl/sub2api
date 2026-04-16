# 支付宝 PC 二维码修复设计

日期：2026-04-16

## 概述

修复当前 PC 端支付宝结账流程，使其满足以下目标：

- 页面内展示的二维码是真正的支付宝扫码支付码，而不是把 `alipay.trade.page.pay` 返回的页面地址再次转成二维码。
- 结账弹窗仍然保留一个兜底按钮，用于打开支付宝 PC 收银台页面，支持弹窗或新窗口支付。
- 移动端支付宝行为保持不变，继续沿用现有的 H5/WAP 跳转流程。

## 当前问题

当前桌面端支付宝 provider 调用的是 `alipay.trade.page.pay`，并把返回的页面地址同时写入 `pay_url` 和 `qr_code`。

这会带来错误的产品行为：

- 前端组件把 `qr_code` 当作原始二维码内容，直接渲染到 canvas。
- 因此最终显示出来的二维码，实际指向的是支付宝网页收银台地址。
- 用户使用支付宝扫码后，会跳进网页支付流程，可能需要在网页中输密码，而不是走支付宝原生 App 内扫码支付体验。

## 目标

- 桌面端支付宝订单同时返回：
  - 一个原生扫码二维码内容
  - 一个备用的收银台页面地址
- 支付弹窗同时展示二维码和“打开收银台”的兜底操作。
- 现有的支付轮询、订单生命周期、Webhook 处理以及移动端支付宝流程不发生行为回归。

## 非目标

- 不修改微信支付行为。
- 不修改 Stripe 行为。
- 不尝试在桌面浏览器里通过自定义 scheme 或 hack 强制唤起支付宝 App。
- 不修改支付配置界面，也不修改 provider 实例的数据结构。

## 推荐方案

### 后端

更新支付宝直连 provider：[backend/internal/payment/provider/alipay.go](/Users/iuh/IdeaProjects/GithubProjects/sub2api/backend/internal/payment/provider/alipay.go)。

对于 `req.IsMobile == true`：

- 保持现有 `alipay.trade.wap.pay` 流程不变。
- 仅返回 `pay_url`。

对于桌面端 `req.IsMobile == false`：

- 使用 `alipay.trade.page.pay` 生成备用收银台地址，并返回到 `pay_url`。
- 使用支付宝预下单能力生成扫码二维码内容，并将上游返回的 `qr_code` 写入 `qr_code`。
- 两次调用使用相同的订单号、金额、商品标题、异步通知地址和同步跳转地址，确保订单跟踪口径一致。

这样桌面端返回结果会从“同一个页面地址复用两次”，改为“一个原生二维码内容 + 一个收银台页面地址”。

### 前端

调整支付等待态 UI，让二维码和备用链接不再互斥。

预计会修改的文件：

- [frontend/src/components/payment/PaymentQRDialog.vue](/Users/iuh/IdeaProjects/GithubProjects/sub2api/frontend/src/components/payment/PaymentQRDialog.vue)
- [frontend/src/components/payment/PaymentStatusPanel.vue](/Users/iuh/IdeaProjects/GithubProjects/sub2api/frontend/src/components/payment/PaymentStatusPanel.vue)
- [frontend/src/views/user/PaymentQRCodeView.vue](/Users/iuh/IdeaProjects/GithubProjects/sub2api/frontend/src/views/user/PaymentQRCodeView.vue)，如果这个旧页面仍在使用

必须满足的 UI 行为：

- 当存在 `qr_code` 时，继续按现有方式渲染二维码 canvas。
- 当同时存在 `pay_url` 时，仍然显示现有的兜底按钮，位置可以在二维码区域下方或旁边。
- 倒计时、取消订单、支付轮询逻辑保持不变。
- 备用按钮触发的弹窗重开逻辑保持不变。

### 数据契约

不需要新增 API 字段。

现有字段已经足够承载目标行为：

- `qr_code`：桌面端改为承载真正的支付宝扫码二维码内容
- `pay_url`：承载桌面端收银台页面地址

`CreateOrderResult` 的结构保持不变。

## 错误处理

- 如果桌面端支付宝预下单失败，应直接让创建订单失败，而不是静默退化回当前错误的二维码行为。
- 如果收银台地址生成失败，也应让创建订单失败，因为已确认的设计要求桌面端必须同时提供两条路径。
- 现有的 Webhook 和查单逻辑保持不变，因为支付确认仍然依赖同一个 `out_trade_no`。

## 测试

### 后端测试

为支付宝 provider 增加测试：

- 移动端请求仅返回 `pay_url`。
- 桌面端请求同时返回 `qr_code` 和 `pay_url`。
- 桌面端的 `qr_code` 必须来自预下单结果，不能再从 `pay_url` 复制。

测试实现上，优先通过最小化的 stub seam 隔离 SDK 调用，让测试关注行为本身，而不是 SDK 内部细节。

### 前端测试

新增或更新组件测试，覆盖以下场景：

- 传入 `qrCode` 时，二维码仍然可见。
- 同时传入 `qrCode` 和 `payUrl` 时，兜底按钮也可见。
- 仅有 `payUrl`、没有 `qrCode` 时，纯弹窗模式仍然正常工作。

## 风险与缓解

### 风险：桌面端分支变为两次上游调用

缓解方式：

- 仅在支付宝桌面端路径中使用该逻辑，不扩大影响面。
- 两次调用复用同一套请求参数。
- 增加聚焦桌面端响应组合逻辑的测试。

### 风险：二维码与兜底按钮并存后引发前端布局回归

缓解方式：

- 尽量保持现有布局，仅移除“二维码模式下隐藏按钮”的互斥逻辑。
- 使用组件测试覆盖二维码与按钮共存状态。

## 实施大纲

1. 在 provider 中补齐桌面端支付宝响应组合逻辑。
2. 先补桌面端与移动端行为的失败测试。
3. 更新支付 UI 组件，使二维码与兜底操作同时展示。
4. 增加前端组合状态测试。
5. 验证针对性的后端与前端测试集。

## 验收标准

- 在桌面端创建支付宝订单时，同时返回有效的 `qr_code` 和 `pay_url`。
- 用户侧支付弹窗同时展示二维码和“打开收银台”兜底按钮。
- 用户扫码后，不再进入当前这种由页面支付地址转二维码导致的网页输密码流程。
- 移动端支付宝订单仍然沿用现有 H5/WAP 跳转路径。
- 现有订单轮询与支付完成流程继续正常工作。
