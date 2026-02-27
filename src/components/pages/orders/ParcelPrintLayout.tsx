import { forwardRef } from "react";
import { OrderDetail } from "../../../types/order";

export interface ParcelPrintOptions {
  showCustomerName: boolean;
  showCustomerId: boolean;
  showCustomerPhone: boolean;
  showCustomerAddress: boolean;
  showProductDetails: boolean;
  showOrderId: boolean;
  showShopName: boolean;
}

interface ParcelPrintLayoutProps {
  orders: (OrderDetail & {
    order: { customer_address?: string; customer_phone?: string };
  })[];
  options: ParcelPrintOptions;
  shopName?: string;
}

const ParcelPrintLayout = forwardRef<HTMLDivElement, ParcelPrintLayoutProps>(
  ({ orders, options, shopName }, ref) => {
    return (
      <div style={{ position: "fixed", left: "-9999px", top: "-9999px" }}>
        <div
          ref={ref}
          style={{
            width: "800px",
            backgroundColor: "#ffffff",
            color: "#111827",
            fontFamily: "'Noto Sans Myanmar', 'Inter', sans-serif",
            padding: "28px",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "20px",
            }}
          >
            {orders.map(({ order, items }) => (
              <div
                key={order.id}
                style={{
                  border: "2px dashed #9ca3af",
                  borderRadius: "8px",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  backgroundColor: "#ffffff",
                }}
              >
                {/* Header */}
                <div
                  style={{
                    borderBottom: "1px solid #e5e7eb",
                    paddingBottom: "8px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <div>
                    {options.showShopName && shopName && (
                      <p
                        style={{
                          fontSize: "16px",
                          fontWeight: "bold",
                          color: "#111827",
                          margin: 0,
                        }}
                      >
                        {shopName}
                      </p>
                    )}
                    {options.showOrderId && (
                      <p
                        style={{
                          fontSize: "11px",
                          color: "#6b7280",
                          fontFamily: "monospace",
                          margin: "2px 0 0",
                        }}
                      >
                        #{order.order_id || order.id}
                      </p>
                    )}
                  </div>
                </div>

                {/* Ship To */}
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                  }}
                >
                  <p
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      color: "#6b7280",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      margin: 0,
                    }}
                  >
                    SHIP TO
                  </p>

                  {options.showCustomerName && (
                    <p
                      style={{
                        fontSize: "18px",
                        fontWeight: "bold",
                        color: "#111827",
                        margin: 0,
                        fontFamily: "'Noto Sans Myanmar', 'Inter', sans-serif",
                      }}
                    >
                      {order.customer_name || "N/A"}
                    </p>
                  )}

                  {options.showCustomerId && order.customer_id && (
                    <p
                      style={{
                        fontSize: "12px",
                        color: "#6b7280",
                        margin: 0,
                      }}
                    >
                      ID: {order.customer_id}
                    </p>
                  )}

                  {options.showCustomerPhone && order.customer_phone && (
                    <p
                      style={{
                        fontSize: "13px",
                        color: "#374151",
                        fontWeight: 600,
                        margin: 0,
                      }}
                    >
                      📞 {order.customer_phone}
                    </p>
                  )}

                  {options.showCustomerAddress && (
                    <p
                      style={{
                        fontSize: "13px",
                        color: "#374151",
                        margin: 0,
                        whiteSpace: "pre-line",
                        fontFamily: "'Noto Sans Myanmar', 'Inter', sans-serif",
                      }}
                    >
                      📍 {order.customer_address || "—"}
                    </p>
                  )}
                </div>

                {/* Product Details */}
                {options.showProductDetails && items && items.length > 0 && (
                  <div
                    style={{
                      borderTop: "1px solid #e5e7eb",
                      paddingTop: "8px",
                    }}
                  >
                    <p
                      style={{
                        fontSize: "10px",
                        fontWeight: 700,
                        color: "#6b7280",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        margin: "0 0 4px",
                      }}
                    >
                      ITEMS
                    </p>
                    <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                      {items.map((item, idx) => (
                        <li
                          key={idx}
                          style={{
                            fontSize: "11px",
                            color: "#374151",
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: "2px",
                          }}
                        >
                          <span
                            style={{
                              flex: 1,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: "250px",
                              paddingRight: "8px",
                            }}
                          >
                            {item.product_url || "Product"}
                          </span>
                          {(item.product_qty || 1) > 0 && (
                            <span style={{ fontWeight: 600, flexShrink: 0 }}>
                              ×{item.product_qty}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "#111827",
                        borderTop: "1px solid #f3f4f6",
                        paddingTop: "4px",
                        marginTop: "4px",
                      }}
                    >
                      <span>Qty: {order.total_qty || 0}</span>
                      <span>Wt: {order.total_weight || 0} kg</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  },
);

ParcelPrintLayout.displayName = "ParcelPrintLayout";

export default ParcelPrintLayout;
