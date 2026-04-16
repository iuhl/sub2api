import { describe, expect, it } from 'vitest'

import { buildPaymentTransition } from './paymentFlow'
import type { CreateOrderResult } from '@/types/payment'

function makeResult(overrides: Partial<CreateOrderResult> = {}): CreateOrderResult {
  return {
    order_id: 42,
    amount: 99,
    pay_amount: 99,
    fee_rate: 0,
    expires_at: '2026-04-16T12:00:00Z',
    ...overrides,
  }
}

describe('buildPaymentTransition', () => {
  it('returns a status transition for desktop qr_code + pay_url and preserves both values', () => {
    const result = makeResult({
      qr_code: 'qr-code-data',
      pay_url: 'https://pay.example/checkout',
    })

    const transition = buildPaymentTransition(result, {
      isMobile: false,
      paymentType: 'alipay',
      orderType: 'balance',
    })

    expect(transition).toEqual({
      kind: 'status',
      state: {
        orderId: 42,
        amount: 99,
        qrCode: 'qr-code-data',
        expiresAt: '2026-04-16T12:00:00Z',
        paymentType: 'alipay',
        payUrl: 'https://pay.example/checkout',
        clientSecret: '',
        payAmount: 0,
        orderType: 'balance',
      },
    })
  })

  it('returns a redirect transition for mobile pay_url', () => {
    const result = makeResult({
      pay_url: 'https://pay.example/mobile',
    })

    const transition = buildPaymentTransition(result, {
      isMobile: true,
      paymentType: 'alipay',
      orderType: 'subscription',
    })

    expect(transition).toEqual({
      kind: 'redirect',
      url: 'https://pay.example/mobile',
      state: {
        orderId: 42,
        amount: 99,
        qrCode: '',
        expiresAt: '2026-04-16T12:00:00Z',
        paymentType: 'alipay',
        payUrl: 'https://pay.example/mobile',
        clientSecret: '',
        payAmount: 0,
        orderType: 'subscription',
      },
    })
  })

  it('returns a stripe transition for client_secret', () => {
    const result = makeResult({
      client_secret: 'pi_secret_123',
      pay_url: 'https://pay.example/should-not-be-used',
      qr_code: 'qr-code-data',
      pay_amount: 123,
    })

    const transition = buildPaymentTransition(result, {
      isMobile: false,
      paymentType: 'stripe',
      orderType: 'balance',
    })

    expect(transition).toEqual({
      kind: 'stripe',
      state: {
        orderId: 42,
        amount: 99,
        qrCode: '',
        expiresAt: '2026-04-16T12:00:00Z',
        paymentType: 'stripe',
        payUrl: '',
        clientSecret: 'pi_secret_123',
        payAmount: 123,
        orderType: 'balance',
      },
    })
  })
})
