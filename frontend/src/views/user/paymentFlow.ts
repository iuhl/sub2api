import type { CreateOrderResult, OrderType } from '@/types/payment'

export interface PaymentSessionState {
  orderId: number
  amount: number
  qrCode: string
  expiresAt: string
  paymentType: string
  payUrl: string
  clientSecret: string
  payAmount: number
  orderType: OrderType | ''
}

export type PaymentTransition =
  | { kind: 'stripe'; state: PaymentSessionState }
  | { kind: 'redirect'; state: PaymentSessionState; url: string }
  | { kind: 'popup'; state: PaymentSessionState; url: string }
  | { kind: 'status'; state: PaymentSessionState }

export interface BuildPaymentTransitionOptions {
  paymentType: string
  orderType: OrderType
  isMobile: boolean
}

function buildSessionState(result: CreateOrderResult, options: BuildPaymentTransitionOptions): PaymentSessionState {
  return {
    orderId: result.order_id,
    amount: result.amount,
    qrCode: '',
    expiresAt: result.expires_at || '',
    paymentType: options.paymentType,
    payUrl: '',
    clientSecret: '',
    payAmount: 0,
    orderType: options.orderType,
  }
}

export function buildPaymentTransition(
  result: CreateOrderResult,
  options: BuildPaymentTransitionOptions,
): PaymentTransition | null {
  const baseState = buildSessionState(result, options)

  if (result.client_secret) {
    return {
      kind: 'stripe',
      state: {
        ...baseState,
        clientSecret: result.client_secret,
        payAmount: result.pay_amount,
      },
    }
  }

  if (options.isMobile && result.pay_url) {
    return {
      kind: 'redirect',
      url: result.pay_url,
      state: {
        ...baseState,
        payUrl: result.pay_url,
      },
    }
  }

  if (result.qr_code) {
    return {
      kind: 'status',
      state: {
        ...baseState,
        qrCode: result.qr_code,
        payUrl: result.pay_url || '',
      },
    }
  }

  if (result.pay_url) {
    return {
      kind: 'popup',
      url: result.pay_url,
      state: {
        ...baseState,
        payUrl: result.pay_url,
      },
    }
  }

  return null
}
