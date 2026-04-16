import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'

const { push, toCanvas } = vi.hoisted(() => ({
  push: vi.fn(),
  toCanvas: vi.fn(),
}))

vi.mock('vue-i18n', async () => {
  const actual = await vi.importActual<typeof import('vue-i18n')>('vue-i18n')
  return {
    ...actual,
    useI18n: () => ({ t: (key: string) => key }),
  }
})

vi.mock('vue-router', () => ({
  useRoute: () => ({
    query: {
      order_id: '1',
      qr: 'https://qr.alipay.com/bax00000000000000000',
      pay_url: 'https://openapi.alipay.com/gateway.do?trade_page_pay=1',
      expires_at: new Date(Date.now() + 60000).toISOString(),
      payment_type: 'alipay',
    },
  }),
  useRouter: () => ({ push }),
}))

vi.mock('qrcode', () => ({
  default: { toCanvas },
}))

vi.mock('@/stores/payment', () => ({
  usePaymentStore: () => ({ pollOrderStatus: vi.fn().mockResolvedValue(null) }),
}))

vi.mock('@/stores', () => ({
  useAppStore: () => ({ showError: vi.fn() }),
}))

vi.mock('@/api/payment', () => ({
  paymentAPI: { cancelOrder: vi.fn().mockResolvedValue(undefined) },
}))

import PaymentQRCodeView from '../PaymentQRCodeView.vue'

describe('PaymentQRCodeView', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillStyle: '',
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      arcTo: vi.fn(),
      fill: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
  })

  afterEach(() => {
    push.mockReset()
    toCanvas.mockReset()
    toCanvas.mockResolvedValue(undefined)
    vi.restoreAllMocks()
  })

  it('shows fallback pay link even when qr is present', async () => {
    const wrapper = mount(PaymentQRCodeView, {
      global: {
        stubs: {
          AppLayout: { template: '<div><slot /></div>' },
        },
      },
    })

    await flushPromises()
    await nextTick()

    expect(wrapper.find('canvas').exists()).toBe(true)
    expect(toCanvas).toHaveBeenCalled()
    expect(wrapper.find('a').attributes('href')).toBe('https://openapi.alipay.com/gateway.do?trade_page_pay=1')

    wrapper.unmount()
  })
})
