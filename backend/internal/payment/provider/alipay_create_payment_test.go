//go:build unit

package provider

import (
	"context"
	"errors"
	"net/url"
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/payment"
	"github.com/smartwalle/alipay/v3"
)

type stubAlipayPaymentGateway struct {
	wapParam       *alipay.TradeWapPay
	pageParam      *alipay.TradePagePay
	precreateParam *alipay.TradePreCreate
	wapURL         *url.URL
	pageURL        *url.URL
	precreateResp  *alipay.TradePreCreateRsp
	precreateErr   error
}

func (s *stubAlipayPaymentGateway) TradeWapPay(param alipay.TradeWapPay) (*url.URL, error) {
	s.wapParam = &param
	return s.wapURL, nil
}

func (s *stubAlipayPaymentGateway) TradePagePay(param alipay.TradePagePay) (*url.URL, error) {
	s.pageParam = &param
	return s.pageURL, nil
}

func (s *stubAlipayPaymentGateway) TradePreCreate(_ context.Context, param alipay.TradePreCreate) (*alipay.TradePreCreateRsp, error) {
	s.precreateParam = &param
	return s.precreateResp, s.precreateErr
}

func mustParseURL(t *testing.T, raw string) *url.URL {
	t.Helper()
	parsed, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("parse url %q: %v", raw, err)
	}
	return parsed
}

func TestAlipayCreatePaymentMobileReturnsPayURLOnly(t *testing.T) {
	t.Parallel()

	stub := &stubAlipayPaymentGateway{
		wapURL: mustParseURL(t, "https://pay.example.test/mobile"),
	}
	p := &Alipay{
		config: map[string]string{
			"notifyUrl": "https://notify.example.test/alipay",
			"returnUrl": "https://return.example.test/alipay",
		},
		paymentGateway: stub,
	}

	got, err := p.CreatePayment(context.Background(), payment.CreatePaymentRequest{
		OrderID:   "order-mobile-001",
		Amount:    "12.34",
		Subject:   "Mobile order",
		NotifyURL: "https://notify.example.test/request",
		ReturnURL: "https://return.example.test/request",
		IsMobile:  true,
	})
	if err != nil {
		t.Fatalf("CreatePayment() error = %v", err)
	}

	if got.TradeNo != "order-mobile-001" {
		t.Fatalf("TradeNo = %q, want %q", got.TradeNo, "order-mobile-001")
	}
	if got.PayURL != "https://pay.example.test/mobile" {
		t.Fatalf("PayURL = %q, want %q", got.PayURL, "https://pay.example.test/mobile")
	}
	if got.QRCode != "" {
		t.Fatalf("QRCode = %q, want empty", got.QRCode)
	}
	if stub.wapParam == nil {
		t.Fatal("TradeWapPay was not called")
	}
	if stub.wapParam.OutTradeNo != "order-mobile-001" {
		t.Fatalf("wap OutTradeNo = %q, want %q", stub.wapParam.OutTradeNo, "order-mobile-001")
	}
	if stub.wapParam.TotalAmount != "12.34" {
		t.Fatalf("wap TotalAmount = %q, want %q", stub.wapParam.TotalAmount, "12.34")
	}
	if stub.wapParam.Subject != "Mobile order" {
		t.Fatalf("wap Subject = %q, want %q", stub.wapParam.Subject, "Mobile order")
	}
	if stub.wapParam.NotifyURL != "https://notify.example.test/request" {
		t.Fatalf("wap NotifyURL = %q, want %q", stub.wapParam.NotifyURL, "https://notify.example.test/request")
	}
	if stub.wapParam.ReturnURL != "https://return.example.test/request" {
		t.Fatalf("wap ReturnURL = %q, want %q", stub.wapParam.ReturnURL, "https://return.example.test/request")
	}
}

func TestAlipayCreatePaymentDesktopReturnsQRCodeAndPayURL(t *testing.T) {
	t.Parallel()

	stub := &stubAlipayPaymentGateway{
		pageURL:       mustParseURL(t, "https://pay.example.test/desktop"),
		precreateResp: &alipay.TradePreCreateRsp{QRCode: "alipay://scan/desktop-qr"},
	}
	p := &Alipay{
		config: map[string]string{
			"notifyUrl": "https://notify.example.test/alipay",
			"returnUrl": "https://return.example.test/alipay",
		},
		paymentGateway: stub,
	}

	got, err := p.CreatePayment(context.Background(), payment.CreatePaymentRequest{
		OrderID:   "order-desktop-001",
		Amount:    "88.80",
		Subject:   "Desktop order",
		NotifyURL: "https://notify.example.test/request",
		ReturnURL: "https://return.example.test/request",
		IsMobile:  false,
	})
	if err != nil {
		t.Fatalf("CreatePayment() error = %v", err)
	}

	if got.TradeNo != "order-desktop-001" {
		t.Fatalf("TradeNo = %q, want %q", got.TradeNo, "order-desktop-001")
	}
	if got.PayURL != "https://pay.example.test/desktop" {
		t.Fatalf("PayURL = %q, want %q", got.PayURL, "https://pay.example.test/desktop")
	}
	if got.QRCode != "alipay://scan/desktop-qr" {
		t.Fatalf("QRCode = %q, want %q", got.QRCode, "alipay://scan/desktop-qr")
	}
	if got.QRCode == got.PayURL {
		t.Fatalf("QRCode should not be copied from PayURL: both are %q", got.PayURL)
	}
	if stub.pageParam == nil {
		t.Fatal("TradePagePay was not called")
	}
	if stub.precreateParam == nil {
		t.Fatal("TradePreCreate was not called")
	}
	if stub.pageParam.OutTradeNo != "order-desktop-001" {
		t.Fatalf("page OutTradeNo = %q, want %q", stub.pageParam.OutTradeNo, "order-desktop-001")
	}
	if stub.pageParam.TotalAmount != "88.80" {
		t.Fatalf("page TotalAmount = %q, want %q", stub.pageParam.TotalAmount, "88.80")
	}
	if stub.pageParam.Subject != "Desktop order" {
		t.Fatalf("page Subject = %q, want %q", stub.pageParam.Subject, "Desktop order")
	}
	if stub.pageParam.NotifyURL != "https://notify.example.test/request" {
		t.Fatalf("page NotifyURL = %q, want %q", stub.pageParam.NotifyURL, "https://notify.example.test/request")
	}
	if stub.pageParam.ReturnURL != "https://return.example.test/request" {
		t.Fatalf("page ReturnURL = %q, want %q", stub.pageParam.ReturnURL, "https://return.example.test/request")
	}
	if stub.precreateParam.OutTradeNo != "order-desktop-001" {
		t.Fatalf("precreate OutTradeNo = %q, want %q", stub.precreateParam.OutTradeNo, "order-desktop-001")
	}
	if stub.precreateParam.TotalAmount != "88.80" {
		t.Fatalf("precreate TotalAmount = %q, want %q", stub.precreateParam.TotalAmount, "88.80")
	}
	if stub.precreateParam.Subject != "Desktop order" {
		t.Fatalf("precreate Subject = %q, want %q", stub.precreateParam.Subject, "Desktop order")
	}
	if stub.precreateParam.ProductCode != alipayProductCodePrePay {
		t.Fatalf("precreate ProductCode = %q, want %q", stub.precreateParam.ProductCode, alipayProductCodePrePay)
	}
	if stub.precreateParam.NotifyURL != "https://notify.example.test/request" {
		t.Fatalf("precreate NotifyURL = %q, want %q", stub.precreateParam.NotifyURL, "https://notify.example.test/request")
	}
	if stub.precreateParam.ReturnURL != "" {
		t.Fatalf("precreate ReturnURL = %q, want empty", stub.precreateParam.ReturnURL)
	}
}

func TestAlipayCreatePaymentDesktopReturnsErrorWhenPrecreateFails(t *testing.T) {
	t.Parallel()

	stub := &stubAlipayPaymentGateway{
		pageURL:      mustParseURL(t, "https://pay.example.test/desktop"),
		precreateErr: errors.New("precreate unavailable"),
	}
	p := &Alipay{
		config: map[string]string{
			"notifyUrl": "https://notify.example.test/alipay",
			"returnUrl": "https://return.example.test/alipay",
		},
		paymentGateway: stub,
	}

	_, err := p.CreatePayment(context.Background(), payment.CreatePaymentRequest{
		OrderID:   "order-desktop-err",
		Amount:    "88.80",
		Subject:   "Desktop order",
		NotifyURL: "https://notify.example.test/request",
		ReturnURL: "https://return.example.test/request",
		IsMobile:  false,
	})
	if err == nil {
		t.Fatal("CreatePayment() error = nil, want non-nil")
	}
	if err.Error() != "alipay TradePreCreate: precreate unavailable" {
		t.Fatalf("CreatePayment() error = %q, want %q", err.Error(), "alipay TradePreCreate: precreate unavailable")
	}
	if stub.precreateParam == nil {
		t.Fatal("TradePreCreate was not called")
	}
	if stub.precreateParam.ProductCode != alipayProductCodePrePay {
		t.Fatalf("precreate ProductCode = %q, want %q", stub.precreateParam.ProductCode, alipayProductCodePrePay)
	}
}
