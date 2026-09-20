import { GATEWAY_RATE_LIMIT_MESSAGE } from "./analyzeClient";

export default function RateLimitBanner({ onDismiss }) {
  return (
    <div className="error-banner rate-limit-banner">
      <span>{GATEWAY_RATE_LIMIT_MESSAGE}</span>
      <button type="button" className="btn btn-outline rate-limit-dismiss" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}
