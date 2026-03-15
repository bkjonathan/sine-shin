import { forwardRef } from "react";
import {
  ParcelPrintLabel,
  ParcelPrintOptions,
} from "../../../types/labelPrint";

interface ParcelPrintLayoutProps {
  labels: ParcelPrintLabel[];
  options: ParcelPrintOptions;
  shopName?: string;
  mode?: "preview" | "print";
}

const ParcelPrintLayout = forwardRef<HTMLDivElement, ParcelPrintLayoutProps>(
  ({ labels, options, shopName, mode = "print" }, ref) => {
    const isPreview = mode === "preview";

    const wrapperStyle = isPreview
      ? undefined
      : { position: "fixed" as const, left: "-9999px", top: "-9999px" };

    return (
      <div style={wrapperStyle}>
        <div
          ref={ref}
          style={{
            width: isPreview ? "100%" : "800px",
            backgroundColor: "#ffffff",
            color: "#111827",
            fontFamily: "'Noto Sans Myanmar', 'Inter', sans-serif",
            padding: "28px",
            boxSizing: "border-box",
            borderRadius: isPreview ? "20px" : undefined,
            border: isPreview ? "1px solid #e5e7eb" : undefined,
            boxShadow: isPreview
              ? "0 18px 40px rgba(15, 23, 42, 0.08)"
              : undefined,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isPreview
                ? "repeat(auto-fit, minmax(260px, 1fr))"
                : "1fr 1fr",
              gap: "20px",
            }}
          >
            {labels.map((label) => (
              <div
                key={label.key}
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
                    gap: "12px",
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
                    {options.showOrderId && label.orderId && (
                      <p
                        style={{
                          fontSize: "11px",
                          color: "#6b7280",
                          fontFamily: "monospace",
                          margin: "2px 0 0",
                        }}
                      >
                        #{label.orderId}
                      </p>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      color: "#6b7280",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {label.kind}
                  </span>
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
                      {label.customerName || "N/A"}
                    </p>
                  )}

                  {options.showCustomerId && label.customerId && (
                    <p
                      style={{
                        fontSize: "12px",
                        color: "#6b7280",
                        margin: 0,
                      }}
                    >
                      ID: {label.customerId}
                    </p>
                  )}

                  {options.showCustomerPhone && label.customerPhone && (
                    <p
                      style={{
                        fontSize: "13px",
                        color: "#374151",
                        fontWeight: 600,
                        margin: 0,
                      }}
                    >
                      📞 {label.customerPhone}
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
                      📍{" "}
                      {[label.customerAddress, label.customerCity]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </p>
                  )}
                </div>

                {/* Product Details */}
                {options.showProductDetails &&
                  label.kind === "order" &&
                  label.items &&
                  label.items.length > 0 && (
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
                      {label.items.map((item, idx) => (
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
                            {item.label || "Product"}
                          </span>
                          {(item.qty || 1) > 0 && (
                            <span style={{ fontWeight: 600, flexShrink: 0 }}>
                              ×{item.qty}
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
                      <span>Qty: {label.totalQty || 0}</span>
                      <span>Wt: {label.totalWeight || 0} kg</span>
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
