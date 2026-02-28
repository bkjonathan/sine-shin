import { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { formatDate } from "../../../utils/date";
import { ShopSettings } from "../../../api/settingApi";
import { OrderItem, OrderWithCustomer } from "../../../types/order";

interface OrderInvoicePrintLayoutProps {
  invoiceRef: RefObject<HTMLDivElement | null>;
  shopSettings: ShopSettings | null;
  logoDataUrl: string;
  order: OrderWithCustomer;
  items: OrderItem[];
  customerName: string;
  customerCode: string;
  customerPhone: string;
  customerCity: string;
  customerAddress: string;
  customerPlatform: string;
  qrCodeUrl: string;
  serviceFeeAmount: number;
  orderTotal: number;
  exchangeRate: number;
  totalWithExchange: number;
  formatPrice: (amount: number) => string;
  formatExchangePrice: (amount: number) => string;
}

export default function OrderInvoicePrintLayout({
  invoiceRef,
  shopSettings,
  logoDataUrl,
  order,
  items,
  customerName,
  customerCode,
  customerPhone,
  customerCity,
  customerAddress,
  customerPlatform,
  qrCodeUrl,
  serviceFeeAmount,
  orderTotal,
  exchangeRate,
  totalWithExchange,
  formatPrice,
  formatExchangePrice,
}: OrderInvoicePrintLayoutProps) {
  const { t } = useTranslation();

  return (
    <div className="fixed left-[-9999px] top-[-9999px] print-source-wrapper">
      <div
        id="invoice-print-container"
        ref={invoiceRef}
        style={{
          width: "800px",
          backgroundColor: "#ffffff",
          color: "#0f172a",
          padding: "36px",
          fontFamily: "'Noto Sans Myanmar', 'Poppins', sans-serif",
          borderRadius: "20px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 24px 44px -30px rgba(15, 23, 42, 0.45)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "40px",
            borderBottom: "2px solid #dbeafe",
            paddingBottom: "32px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
            {logoDataUrl && (
              <img
                src={logoDataUrl}
                alt="Logo"
                style={{
                  width: "96px",
                  height: "96px",
                  objectFit: "contain",
                  borderRadius: "8px",
                  border: "1px solid #f1f5f9",
                }}
              />
            )}
            <div>
              <h1
                style={{
                  fontSize: "30px",
                  fontWeight: "bold",
                  color: "#0f172a",
                  marginBottom: "8px",
                  letterSpacing: "0.01em",
                }}
              >
                {shopSettings?.shop_name || "Sine Shin"}
              </h1>
              <div
                style={{
                  fontSize: "14px",
                  color: "#64748b",
                  lineHeight: "1.5",
                }}
              >
                {shopSettings?.phone && (
                  <p
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      margin: 0,
                    }}
                  >
                    <span>{t("common.tel")}:</span> {shopSettings.phone}
                  </p>
                )}
                {shopSettings?.address && (
                  <p style={{ maxWidth: "300px", margin: 0 }}>
                    {shopSettings.address}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <h2
              style={{
                fontSize: "36px",
                fontWeight: "900",
                color: "#dbeafe",
                marginBottom: "8px",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                margin: 0,
              }}
            >
              {t("orders.invoice.title")}
            </h2>
            <div
              style={{
                fontSize: "14px",
                fontWeight: "500",
                color: "#475569",
              }}
            >
              <p style={{ margin: "4px 0" }}>#{order.order_id || order.id}</p>
              <p style={{ margin: 0 }}>{formatDate(order.order_date)}</p>
            </div>
          </div>
        </div>

        <div
          style={{
            marginBottom: "40px",
            padding: "0",
          }}
        >
          <h3
            style={{
              fontSize: "11px",
              fontWeight: "700",
              color: "#64748b",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              margin: "0 0 14px 0",
            }}
          >
            {t("orders.invoice.bill_to")}
          </h3>
          <div
            style={{
              border: "1px solid #dbeafe",
              borderRadius: "16px",
              background:
                "linear-gradient(140deg, #f8fbff 0%, #eff6ff 62%, #ecfeff 100%)",
              padding: "18px 20px",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.65)",
            }}
          >
            <div
              style={{
                fontSize: "13px",
              }}
            >
              <p
                style={{
                  fontSize: "20px",
                  fontWeight: "700",
                  color: "#0f172a",
                  margin: 0,
                  letterSpacing: "0.01em",
                }}
              >
                {customerName}
              </p>
              <p
                style={{
                  fontSize: "12px",
                  color: "#334155",
                  margin: "5px 0 0",
                  fontWeight: "600",
                }}
              >
                {t("customers.id_label")}: {customerCode}
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "110px 1fr",
                  rowGap: "6px",
                  columnGap: "8px",
                  marginTop: "16px",
                }}
              >
                <span style={{ color: "#64748b" }}>
                  {t("customers.form.phone")}
                </span>
                <span style={{ color: "#0f172a", fontWeight: "500" }}>
                  {customerPhone}
                </span>
                <span style={{ color: "#64748b" }}>
                  {t("customers.form.city")}
                </span>
                <span style={{ color: "#0f172a", fontWeight: "500" }}>
                  {customerCity}
                </span>
                <span style={{ color: "#64748b" }}>
                  {t("customers.form.address")}
                </span>
                <span style={{ color: "#0f172a", fontWeight: "500" }}>
                  {customerAddress}
                </span>
                <span style={{ color: "#64748b" }}>
                  {t("orders.invoice.platform")}
                </span>
                <span style={{ color: "#0f172a", fontWeight: "500" }}>
                  {customerPlatform}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: "40px" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              textAlign: "left",
            }}
          >
            <thead>
              <tr style={{ borderBottom: "2px solid #0f172a" }}>
                <th
                  style={{
                    padding: "12px 0",
                    fontSize: "12px",
                    fontWeight: "bold",
                    color: "#0f172a",
                    textTransform: "uppercase",
                    width: "48px",
                  }}
                >
                  {t("common.no")}
                </th>
                <th
                  style={{
                    padding: "12px 0",
                    fontSize: "12px",
                    fontWeight: "bold",
                    color: "#0f172a",
                    textTransform: "uppercase",
                  }}
                >
                  {t("orders.product_link")}
                </th>
                <th
                  style={{
                    padding: "12px 0",
                    fontSize: "12px",
                    fontWeight: "bold",
                    color: "#0f172a",
                    textTransform: "uppercase",
                    textAlign: "right",
                    width: "96px",
                  }}
                >
                  {t("orders.invoice.qty")}
                </th>
                <th
                  style={{
                    padding: "12px 0",
                    fontSize: "12px",
                    fontWeight: "bold",
                    color: "#0f172a",
                    textTransform: "uppercase",
                    textAlign: "right",
                    width: "128px",
                  }}
                >
                  {t("orders.invoice.price")}
                </th>
                <th
                  style={{
                    padding: "12px 0",
                    fontSize: "12px",
                    fontWeight: "bold",
                    color: "#0f172a",
                    textTransform: "uppercase",
                    textAlign: "right",
                    width: "128px",
                  }}
                >
                  {t("orders.invoice.amount")}
                </th>
              </tr>
            </thead>
            <tbody style={{ fontSize: "14px", color: "#334155" }}>
              {items.map((item, index) => (
                <tr key={index} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td
                    style={{
                      padding: "16px 0",
                      color: "#94a3b8",
                      fontWeight: "500",
                    }}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </td>
                  <td style={{ padding: "16px 0", fontWeight: "500" }}>
                    {item.product_url && (
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#0f172a",
                          marginTop: "4px",
                          wordBreak: "break-all",
                          maxWidth: "300px",
                        }}
                      >
                        {item.product_url}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "16px 0", textAlign: "right" }}>
                    {item.product_qty}
                  </td>
                  <td style={{ padding: "16px 0", textAlign: "right" }}>
                    {formatPrice(item.price || 0)}
                  </td>
                  <td
                    style={{
                      padding: "16px 0",
                      textAlign: "right",
                      fontWeight: "600",
                    }}
                  >
                    {formatPrice((item.price || 0) * (item.product_qty || 1))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <div style={{ textAlign: "left" }}>
            {qrCodeUrl && (
              <img
                src={qrCodeUrl}
                alt="Order QR Code"
                style={{ width: "100px", height: "100px" }}
              />
            )}
          </div>
          <div
            style={{
              width: "50%",
              backgroundColor: "#f8fafc",
              borderRadius: "12px",
              padding: "24px",
              border: "1px solid #f1f5f9",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "12px",
                fontSize: "14px",
                color: "#64748b",
              }}
            >
              <span>{t("orders.invoice.subtotal")}</span>
              <span style={{ fontWeight: "500", color: "#0f172a" }}>
                {formatPrice(order.total_price || 0)}
              </span>
            </div>
            {serviceFeeAmount > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "8px",
                  fontSize: "14px",
                  color: "#64748b",
                }}
              >
                <span>{t("orders.form.service_fee")}</span>
                <span style={{ fontWeight: "500", color: "#0f172a" }}>
                  {formatPrice(serviceFeeAmount)}
                </span>
              </div>
            )}
            {(order.shipping_fee || 0) > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "8px",
                  fontSize: "14px",
                  color: "#64748b",
                }}
              >
                <span>{t("orders.form.shipping_fee")}</span>
                <span style={{ fontWeight: "500", color: "#0f172a" }}>
                  {formatPrice(order.shipping_fee || 0)}
                </span>
              </div>
            )}
            {(order.delivery_fee || 0) > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "8px",
                  fontSize: "14px",
                  color: "#64748b",
                }}
              >
                <span>{t("orders.form.delivery_fee")}</span>
                <span style={{ fontWeight: "500", color: "#0f172a" }}>
                  {formatPrice(order.delivery_fee || 0)}
                </span>
              </div>
            )}
            {(order.cargo_fee || 0) > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "8px",
                  fontSize: "14px",
                  color: "#64748b",
                }}
              >
                <span>{t("orders.form.cargo_fee")}</span>
                <span style={{ fontWeight: "500", color: "#0f172a" }}>
                  {formatPrice(order.cargo_fee || 0)}
                </span>
              </div>
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "16px",
                fontSize: "14px",
                color: "#64748b",
                paddingTop: "8px",
                paddingBottom: "16px",
                borderTop: "1px dashed #cbd5e1",
                borderBottom: "1px solid #e2e8f0",
              }}
            >
              <span>{t("orders.invoice.total_fees")}</span>
              <span style={{ fontWeight: "500", color: "#0f172a" }}>
                {formatPrice(
                  (order.shipping_fee || 0) +
                    (order.delivery_fee || 0) +
                    (order.cargo_fee || 0) +
                    serviceFeeAmount,
                )}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "12px",
                fontSize: "14px",
                color: "#64748b",
              }}
            >
              <span>{t("orders.form.exchange_rate")}</span>
              <span style={{ fontWeight: "500", color: "#0f172a" }}>
                {formatExchangePrice(exchangeRate)}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "20px",
                fontWeight: "bold",
                color: "#0f172a",
              }}
            >
              <span>{t("orders.invoice.total")}</span>
              <span>{formatPrice(orderTotal)}</span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: "10px",
                paddingTop: "10px",
                borderTop: "1px dashed #cbd5e1",
                fontSize: "14px",
                color: "#334155",
                fontWeight: "600",
              }}
            >
              <span>{t("orders.invoice.total_with_exchange")}</span>
              <span>{formatExchangePrice(totalWithExchange)}</span>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: "64px",
            paddingTop: "32px",
            borderTop: "1px solid #f1f5f9",
            textAlign: "center",
            fontSize: "12px",
            color: "#94a3b8",
          }}
        >
          <p style={{ margin: 0 }}>{t("orders.invoice.footer_message")}</p>
          <p style={{ marginTop: "4px" }}>
            {t("orders.invoice.footer_credit")}
          </p>
        </div>
      </div>
    </div>
  );
}
