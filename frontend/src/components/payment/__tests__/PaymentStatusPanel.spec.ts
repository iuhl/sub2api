import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { cancelOrder, pollOrderStatus, showError, toCanvas } = vi.hoisted(() => ({
  cancelOrder: vi.fn(),
  pollOrderStatus: vi.fn(),
  showError: vi.fn(),
  toCanvas: vi.fn(),
}))

vi.mock('qrcode', () => ({
  default: {
    toCanvas,
  },
}))

vi.mock('@/stores/payment', () => ({
  usePaymentStore: () => ({
    pollOrderStatus,
  }),
}))

vi.mock('@/stores', () => ({
  useAppStore: () => ({
    showError,
  }),
}))

vi.mock('@/api/payment', () => ({
  paymentAPI: {
    cancelOrder,
  },
}))

vi.mock('vue-i18n', async () => {
  const actual = await vi.importActual<typeof import('vue-i18n')>('vue-i18n')
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string) => key,
    }),
  }
})

import PaymentStatusPanel from '../PaymentStatusPanel.vue'

describe('PaymentStatusPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    cancelOrder.mockReset()
    pollOrderStatus.mockReset()
    showError.mockReset()
    toCanvas.mockReset()
    toCanvas.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('renders the qr canvas and fallback pay button when qrCode and payUrl are both present', async () => {
    const wrapper = mount(PaymentStatusPanel, {
      props: {
        orderId: 1,
        qrCode: 'https://example.com/qr',
        expiresAt: '2030-01-01T00:30:00.000Z',
        paymentType: 'alipay',
        payUrl: 'https://example.com/pay',
      },
    })

    await flushPromises()

    expect(wrapper.find('canvas').exists()).toBe(true)
    expect(toCanvas).toHaveBeenCalled()
    expect(wrapper.findAll('button').some((button) => button.text().includes('payment.qr.openPayWindow'))).toBe(true)

    wrapper.unmount()
  })
})
