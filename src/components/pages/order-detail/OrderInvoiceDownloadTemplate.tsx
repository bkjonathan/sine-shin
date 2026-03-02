import { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { formatDate } from "../../../utils/date";
import { ShopSettings } from "../../../api/settingApi";
import { OrderItem, OrderWithCustomer } from "../../../types/order";

interface OrderInvoiceDownloadTemplateProps {
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

export default function OrderInvoiceDownloadTemplate({
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
}: OrderInvoiceDownloadTemplateProps) {
  const { t } = useTranslation();
  const subtotal = order.total_price || 0;
  const productDiscount = order.product_discount || 0;
  const totalQty = order.total_qty || 0;
  const totalWeight = order.total_weight || 0;
  const totalFees =
    (order.shipping_fee || 0) +
    (order.delivery_fee || 0) +
    (order.cargo_fee || 0) +
    serviceFeeAmount;

  return (
    <div className="fixed left-[-9999px] top-[-9999px] print-source-wrapper">
      <div
        id="invoice-download-container"
        ref={invoiceRef}
        style={{
          width: "920px",
          background:
            "linear-gradient(180deg, #eff6ff 0%, #ffffff 120px, #ffffff 100%)",
          color: "#0f172a",
          padding: "40px",
          fontFamily: "'Noto Sans Myanmar', 'Poppins', sans-serif",
          borderRadius: "18px",
          border: "1px solid #dbeafe",
          boxShadow: "0 26px 54px -32px rgba(15, 23, 42, 0.45)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "28px",
            paddingBottom: "24px",
            borderBottom: "1px solid #bfdbfe",
          }}
        >
          <div style={{ display: "flex", gap: "18px", alignItems: "center" }}>
            {logoDataUrl && (
              <img
                src={logoDataUrl}
                alt="Logo"
                style={{
                  width: "84px",
                  height: "84px",
                  objectFit: "contain",
                  borderRadius: "10px",
                  border: "1px solid #e2e8f0",
                  backgroundColor: "#ffffff",
                  padding: "6px",
                }}
              />
            )}
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: "30px",
                  fontWeight: 800,
                  letterSpacing: "0.01em",
                }}
              >
                {shopSettings?.shop_name || "Sine Shin"}
              </h1>
              <p style={{ margin: "8px 0 0", fontSize: "13px", color: "#475569" }}>
                {shopSettings?.phone
                  ? `${t("common.tel")}: ${shopSettings.phone}`
                  : ""}
              </p>
              <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#475569" }}>
                {shopSettings?.address || ""}
              </p>
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div
              style={{
                display: "inline-flex",
                borderRadius: "999px",
                padding: "6px 14px",
                background:
                  "linear-gradient(135deg, #2563eb 0%, #0ea5e9 55%, #14b8a6 100%)",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: "12px",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginBottom: "12px",
              }}
            >
              {t("orders.invoice.title")}
            </div>
            <p style={{ margin: 0, fontSize: "14px", color: "#334155" }}>
              #{order.order_id || order.id}
            </p>
            <p style={{ margin: "4px 0 0", fontSize: "14px", color: "#334155" }}>
              {formatDate(order.order_date)}
            </p>
            <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>
              Status: {(order.status || "pending").toUpperCase()}
            </p>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "14px",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              border: "1px solid #dbeafe",
              borderRadius: "14px",
              backgroundColor: "#f8fafc",
              padding: "16px",
            }}
          >
            <h3
              style={{
                margin: "0 0 10px",
                fontSize: "11px",
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {t("orders.invoice.bill_to")}
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: "20px",
                color: "#0f172a",
                fontWeight: 700,
              }}
            >
              {customerName}
            </p>
            <p style={{ margin: "4px 0 10px", fontSize: "12px", color: "#334155" }}>
              {t("customers.id_label")}: {customerCode}
            </p>
            <p style={{ margin: "2px 0", fontSize: "13px", color: "#334155" }}>
              {t("customers.form.phone")}: {customerPhone}
            </p>
            <p style={{ margin: "2px 0", fontSize: "13px", color: "#334155" }}>
              {t("customers.form.city")}: {customerCity}
            </p>
            <p style={{ margin: "2px 0", fontSize: "13px", color: "#334155" }}>
              {t("customers.form.address")}: {customerAddress}
            </p>
          </div>

          <div
            style={{
              border: "1px solid #dbeafe",
              borderRadius: "14px",
              backgroundColor: "#f8fafc",
              padding: "16px",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              rowGap: "8px",
            }}
          >
            <span style={{ fontSize: "12px", color: "#64748b" }}>
              {t("orders.invoice.platform")}
            </span>
            <span style={{ fontSize: "13px", color: "#0f172a", textAlign: "right" }}>
              {customerPlatform}
            </span>
            <span style={{ fontSize: "12px", color: "#64748b" }}>Total Qty</span>
            <span style={{ fontSize: "13px", color: "#0f172a", textAlign: "right" }}>
              {totalQty}
            </span>
            <span style={{ fontSize: "12px", color: "#64748b" }}>Total Weight</span>
            <span style={{ fontSize: "13px", color: "#0f172a", textAlign: "right" }}>
              {totalWeight} kg
            </span>
            <span style={{ fontSize: "12px", color: "#64748b" }}>
              {t("orders.form.exchange_rate")}
            </span>
            <span style={{ fontSize: "13px", color: "#0f172a", textAlign: "right" }}>
              {formatExchangePrice(exchangeRate)}
            </span>
          </div>
        </div>

        <div style={{ marginBottom: "24px" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "separate",
              borderSpacing: 0,
              border: "1px solid #dbeafe",
              borderRadius: "14px",
              overflow: "hidden",
              backgroundColor: "#ffffff",
            }}
          >
            <thead>
              <tr style={{ backgroundColor: "#eff6ff" }}>
                <th
                  style={{
                    padding: "12px",
                    textAlign: "left",
                    fontSize: "12px",
                    color: "#0f172a",
                    textTransform: "uppercase",
                  }}
                >
                  {t("common.no")}
                </th>
                <th
                  style={{
                    padding: "12px",
                    textAlign: "left",
                    fontSize: "12px",
                    color: "#0f172a",
                    textTransform: "uppercase",
                  }}
                >
                  {t("orders.product_link")}
                </th>
                <th
                  style={{
                    padding: "12px",
                    textAlign: "right",
                    fontSize: "12px",
                    color: "#0f172a",
                    textTransform: "uppercase",
                  }}
                >
                  {t("orders.invoice.qty")}
                </th>
                <th
                  style={{
                    padding: "12px",
                    textAlign: "right",
                    fontSize: "12px",
                    color: "#0f172a",
                    textTransform: "uppercase",
                  }}
                >
                  {t("orders.invoice.price")}
                </th>
                <th
                  style={{
                    padding: "12px",
                    textAlign: "right",
                    fontSize: "12px",
                    color: "#0f172a",
                    textTransform: "uppercase",
                  }}
                >
                  Weight
                </th>
                <th
                  style={{
                    padding: "12px",
                    textAlign: "right",
                    fontSize: "12px",
                    color: "#0f172a",
                    textTransform: "uppercase",
                  }}
                >
                  {t("orders.invoice.amount")}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={index}>
                  <td
                    style={{
                      borderTop: "1px solid #f1f5f9",
                      padding: "12px",
                      fontSize: "13px",
                      color: "#64748b",
                    }}
                  >
                    {index + 1}
                  </td>
                  <td
                    style={{
                      borderTop: "1px solid #f1f5f9",
                      padding: "12px",
                      fontSize: "13px",
                      color: "#0f172a",
                      wordBreak: "break-all",
                      maxWidth: "320px",
                    }}
                  >
                    {item.product_url || "-"}
                  </td>
                  <td
                    style={{
                      borderTop: "1px solid #f1f5f9",
                      padding: "12px",
                      textAlign: "right",
                      fontSize: "13px",
                      color: "#0f172a",
                    }}
                  >
                    {item.product_qty || 0}
                  </td>
                  <td
                    style={{
                      borderTop: "1px solid #f1f5f9",
                      padding: "12px",
                      textAlign: "right",
                      fontSize: "13px",
                      color: "#0f172a",
                    }}
                  >
                    {formatPrice(item.price || 0)}
                  </td>
                  <td
                    style={{
                      borderTop: "1px solid #f1f5f9",
                      padding: "12px",
                      textAlign: "right",
                      fontSize: "13px",
                      color: "#0f172a",
                    }}
                  >
                    {item.product_weight || 0} kg
                  </td>
                  <td
                    style={{
                      borderTop: "1px solid #f1f5f9",
                      padding: "12px",
                      textAlign: "right",
                      fontSize: "13px",
                      color: "#0f172a",
                      fontWeight: 600,
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
            display: "grid",
            gridTemplateColumns: "1fr 340px",
            gap: "18px",
            alignItems: "stretch",
          }}
        >
          <div
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: "14px",
              padding: "14px",
              backgroundColor: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>Notes</p>
              <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#334155" }}>
                Keep this invoice for payment confirmation and shipment tracking.
              </p>
              <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#94a3b8" }}>
                {t("orders.invoice.footer_message")}
              </p>
            </div>
            {qrCodeUrl && (
              <img
                src={qrCodeUrl}
                alt="Order QR Code"
                style={{
                  width: "92px",
                  height: "92px",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  padding: "4px",
                  backgroundColor: "#ffffff",
                }}
              />
            )}
          </div>

          <div
            style={{
              border: "1px solid #dbeafe",
              borderRadius: "14px",
              padding: "18px",
              background:
                "linear-gradient(170deg, #ffffff 0%, #f8fafc 70%, #eff6ff 100%)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "13px",
                marginBottom: "8px",
                color: "#334155",
              }}
            >
              <span>{t("orders.invoice.subtotal")}</span>
              <span>{formatPrice(subtotal)}</span>
            </div>

            {productDiscount > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "13px",
                  marginBottom: "8px",
                  color: "#334155",
                }}
              >
                <span>{t("orders.form.product_discount")}</span>
                <span>{formatPrice(productDiscount)}</span>
              </div>
            )}

            {serviceFeeAmount > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "13px",
                  marginBottom: "8px",
                  color: "#334155",
                }}
              >
                <span>{t("orders.form.service_fee")}</span>
                <span>{formatPrice(serviceFeeAmount)}</span>
              </div>
            )}

            {(order.shipping_fee || 0) > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "13px",
                  marginBottom: "8px",
                  color: "#334155",
                }}
              >
                <span>{t("orders.form.shipping_fee")}</span>
                <span>{formatPrice(order.shipping_fee || 0)}</span>
              </div>
            )}

            {(order.delivery_fee || 0) > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "13px",
                  marginBottom: "8px",
                  color: "#334155",
                }}
              >
                <span>{t("orders.form.delivery_fee")}</span>
                <span>{formatPrice(order.delivery_fee || 0)}</span>
              </div>
            )}

            {(order.cargo_fee || 0) > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "13px",
                  marginBottom: "8px",
                  color: "#334155",
                }}
              >
                <span>{t("orders.form.cargo_fee")}</span>
                <span>{formatPrice(order.cargo_fee || 0)}</span>
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "13px",
                marginTop: "10px",
                paddingTop: "10px",
                borderTop: "1px dashed #cbd5e1",
                color: "#334155",
              }}
            >
              <span>{t("orders.invoice.total_fees")}</span>
              <span>{formatPrice(totalFees)}</span>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "22px",
                marginTop: "12px",
                fontWeight: 800,
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
                fontSize: "13px",
                marginTop: "10px",
                paddingTop: "10px",
                borderTop: "1px solid #dbeafe",
                color: "#0f172a",
                fontWeight: 600,
              }}
            >
              <span>{t("orders.invoice.total_with_exchange")}</span>
              <span>{formatExchangePrice(totalWithExchange)}</span>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: "24px",
            textAlign: "center",
            fontSize: "12px",
            color: "#64748b",
          }}
        >
          <p style={{ margin: 0 }}>{t("orders.invoice.footer_credit")}</p>
        </div>
      </div>
    </div>
  );
}
