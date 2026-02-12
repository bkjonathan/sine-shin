import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";

// Step indicator icons
const StepIcon = ({ step, current }: { step: number; current: number }) => {
  const isCompleted = current > step;
  const isActive = current === step;

  return (
    <div className="flex items-center">
      <div
        className={`
          w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold
          transition-all duration-300 ease-out
          ${
            isCompleted
              ? "bg-[var(--color-success)] text-white shadow-[0_0_12px_rgba(52,211,153,0.4)]"
              : isActive
                ? "bg-[var(--color-accent)] text-white shadow-[0_0_12px_var(--color-accent-glow)]"
                : "bg-[var(--color-bg-primary)] text-[var(--color-text-muted)] border border-[var(--color-border)]"
          }
        `}
      >
        {isCompleted ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M3 8L6.5 11.5L13 4.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          step + 1
        )}
      </div>
      {step < 2 && (
        <div
          className={`
            w-16 h-0.5 mx-2 rounded transition-all duration-300
            ${current > step ? "bg-[var(--color-success)]" : "bg-[var(--color-border)]"}
          `}
        />
      )}
    </div>
  );
};

export default function OnboardingForm() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Form data
  const [shopName, setShopName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [logoPath, setLogoPath] = useState("");
  const [logoPreview, setLogoPreview] = useState("");

  const stepLabels = ["Shop Info", "Address", "Logo"];

  const handlePickLogo = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "Images",
            extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"],
          },
        ],
      });
      if (selected) {
        setLogoPath(selected);
        // Convert to asset URL for preview
        const assetUrl = convertFileSrc(selected);
        setLogoPreview(assetUrl);
      }
    } catch (err) {
      console.error("Failed to pick image:", err);
    }
  };

  const handleNext = () => {
    setError("");
    if (currentStep === 0 && !shopName.trim()) {
      setError("Shop name is required");
      return;
    }
    setCurrentStep((prev) => Math.min(prev + 1, 2));
  };

  const handleBack = () => {
    setError("");
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleSubmit = async () => {
    setError("");
    setIsSubmitting(true);
    try {
      await invoke("save_shop_setup", {
        name: shopName.trim(),
        phone: phone.trim(),
        address: address.trim(),
        logoFilePath: logoPath,
      });
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      setError(typeof err === "string" ? err : err.message || "Failed to save");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full min-h-screen flex items-center justify-content p-6">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-[var(--color-accent)] opacity-[0.03] blur-[100px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-purple-600 opacity-[0.03] blur-[100px]" />
      </div>

      <div className="w-full max-w-lg mx-auto animate-fade-in-up">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--color-accent)] bg-opacity-20 mb-4">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">
            Set Up Your Shop
          </h1>
          <p className="text-[var(--color-text-secondary)] text-sm">
            Let's get your shop configured in just a few steps
          </p>
        </div>

        {/* Step Indicators */}
        <div className="flex items-center justify-center mb-8">
          {stepLabels.map((label, i) => (
            <div key={i} className="flex items-center">
              <div className="flex flex-col items-center">
                <StepIcon step={i} current={currentStep} />
                <span
                  className={`
                    text-xs mt-2 transition-colors duration-200
                    ${currentStep === i ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]"}
                  `}
                >
                  {label}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Form Card */}
        <div className="glass-card p-8">
          {/* Error message */}
          {error && (
            <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-[var(--color-error)] text-sm animate-fade-in">
              {error}
            </div>
          )}

          {/* Step 1: Shop Name & Phone */}
          {currentStep === 0 && (
            <div className="space-y-5 animate-fade-in">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  Shop Name <span className="text-[var(--color-error)]">*</span>
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Enter your shop name"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  className="input-field"
                  placeholder="Enter phone number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Step 2: Address */}
          {currentStep === 1 && (
            <div className="space-y-5 animate-fade-in">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  Shop Address
                </label>
                <textarea
                  className="input-field min-h-[120px] resize-none"
                  placeholder="Enter your shop address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
          )}

          {/* Step 3: Logo Upload */}
          {currentStep === 2 && (
            <div className="space-y-5 animate-fade-in">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  Shop Logo
                </label>
                <button
                  type="button"
                  onClick={handlePickLogo}
                  className="
                    w-full h-48 rounded-xl border-2 border-dashed border-[var(--color-border)]
                    bg-[var(--color-bg-primary)] bg-opacity-50
                    flex flex-col items-center justify-center gap-3
                    cursor-pointer transition-all duration-200
                    hover:border-[var(--color-accent)] hover:bg-opacity-80
                    group overflow-hidden
                  "
                >
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt="Logo preview"
                      className="w-full h-full object-contain p-4"
                    />
                  ) : (
                    <>
                      <svg
                        width="40"
                        height="40"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--color-text-muted)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="group-hover:stroke-[var(--color-accent)] transition-colors"
                      >
                        <rect
                          x="3"
                          y="3"
                          width="18"
                          height="18"
                          rx="2"
                          ry="2"
                        />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                      <span className="text-sm text-[var(--color-text-muted)] group-hover:text-[var(--color-accent)] transition-colors">
                        Click to choose an image
                      </span>
                    </>
                  )}
                </button>
                {logoPath && (
                  <p className="mt-2 text-xs text-[var(--color-text-muted)] truncate">
                    {logoPath}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between mt-8">
            {currentStep > 0 ? (
              <button className="btn-secondary" onClick={handleBack}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10 12L6 8L10 4" />
                </svg>
                Back
              </button>
            ) : (
              <div />
            )}

            {currentStep < 2 ? (
              <button className="btn-primary" onClick={handleNext}>
                Next
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 4L10 8L6 12" />
                </svg>
              </button>
            ) : (
              <button
                className="btn-primary"
                onClick={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    Complete Setup
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 8L6.5 11.5L13 4.5" />
                    </svg>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-[var(--color-text-muted)] mt-6">
          You can update these settings later from the Settings page
        </p>
      </div>
    </div>
  );
}
