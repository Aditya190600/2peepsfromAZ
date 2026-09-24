// Shared compliance vocabulary: labels, regulatory citations, and severity
// ranking for each check, plus the headline-risk-verdict rollup. Lives
// outside Dashboard.jsx so History.jsx can compute the same verdict from a
// stored report without re-importing the whole dashboard.

export const CHECK_LABEL = {
  consent: "Consent logged (TCPA)",
  ai_disclosure: "AI disclosure timing",
  recording_consent: "Recording-consent disclosure",
  opt_out: "Opt-out honored (TCPA)",
  pii_scan: "PII pattern scan",
  scope_adherence: "Stayed within persona scope",
  mini_miranda: "Mini-Miranda disclosure (FDCPA)",
};

export const CHECK_CITATION = {
  consent: "TCPA, 47 U.S.C. §227; 47 CFR §64.1200(a) — prior express consent required before an autodialed/AI call.",
  ai_disclosure: "CA AB 2905 (Cal. Pub. Util. Code §2872) — AI voice callers must disclose their artificial nature.",
  recording_consent: "State two-party consent (wiretap) statutes, e.g. Cal. Penal Code §632 — notice required before recording a call.",
  opt_out: "TCPA, 47 CFR §64.1200(d) — do-not-call requests must be honored.",
  pii_scan: "Pattern pack dependent — see citation on each matched pack below.",
  scope_adherence:
    "Unauthorized disclosure of information outside the agent's declared authority (e.g. FERPA §99.31 third-party disclosure limits, HIPAA minimum-necessary standard) depending on the persona.",
  mini_miranda: "FDCPA, 15 U.S.C. §1692e(11) — debt collectors must disclose the call is an attempt to collect a debt.",
};

export const PACK_CITATION = {
  generic: "State data-breach notification laws (e.g. Cal. Civ. Code §1798.82) — SSN/card/account numbers are regulated PII.",
  hipaa: "HIPAA Privacy Rule Safe Harbor, 45 CFR §164.514(b)(2) — 18 identifier categories requiring de-identification.",
  finance: "GLBA Safeguards Rule, 15 U.S.C. §6801 — nonpublic personal financial information must be protected.",
  ferpa: "FERPA, 34 CFR §99.3 — education-record PII includes student numbers and direct or indirect identifiers linked to a student.",
  gdpr: "EU Regulation 2016/679 (GDPR), Art. 6/7 lawful basis and consent, Art. 13/14 required information to the data subject.",
  llm_gateway_ner: "State data-breach notification laws — free-form PII (names, emails, addresses) is regulated personal information.",
};

// Missing consent / PII exposure carries statutory per-call damages; late
// disclosure is a single-call statute violation; recording disclosure is a
// state-by-state notice requirement, most often civil rather than statutory-fine risk.
export const CHECK_SEVERITY = {
  consent: "critical",
  pii_scan: "critical",
  ai_disclosure: "high",
  recording_consent: "medium",
  opt_out: "high",
  scope_adherence: "critical",
  mini_miranda: "high",
};

export const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
export const SEVERITY_LABEL = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };

function severityOf(finding) {
  if (finding.status !== "flag") return null;
  return CHECK_SEVERITY[finding.check] ?? "low";
}

// Sorts findings worst-first: flagged checks by severity, then errored
// checks (unknown risk - can't be cleared), then passes/n-a last.
export function sortFindingsBySeverity(findings) {
  const rank = (f) => {
    if (f.status === "flag") return SEVERITY_RANK[severityOf(f)] ?? 3;
    if (f.status === "error") return 4;
    return 5;
  };
  return [...findings].sort((a, b) => rank(a) - rank(b));
}

// One headline verdict for a report: worst severity among flagged findings,
// or "review" if nothing flagged but a check errored, or "clear" otherwise.
export function headlineVerdict(findings) {
  const flagged = findings.filter((f) => f.status === "flag");
  if (flagged.length > 0) {
    const worst = flagged
      .map(severityOf)
      .sort((a, b) => SEVERITY_RANK[a] - SEVERITY_RANK[b])[0];
    return { level: worst, label: `${SEVERITY_LABEL[worst]} risk`, flaggedCount: flagged.length };
  }
  const errored = findings.filter((f) => f.status === "error");
  if (errored.length > 0) {
    return { level: "review", label: "Needs review", flaggedCount: 0 };
  }
  return { level: "clear", label: "Clear", flaggedCount: 0 };
}

export const VERDICT_CLASS = {
  critical: "is-critical",
  high: "is-high",
  medium: "is-medium",
  review: "is-review",
  clear: "is-clear",
};

// Turns per-check progress (server/index.js's streamed /v1/analyze-session,
// accumulated in Dashboard.jsx) into the "Analyzing…" copy, so the loading
// state shows real, changing numbers instead of a static message.
export function formatAnalyzingMessage(progress) {
  if (!progress || !progress.checksTotal) return "Analyzing session…";
  const parts = [`Analyzing… ${progress.checksDone} of ${progress.checksTotal} checks complete`];
  if (progress.tokensUsed > 0) parts.push(`${progress.tokensUsed.toLocaleString()} tokens used`);
  if (progress.costKnown) parts.push(`~$${progress.costUsd.toFixed(4)} estimated`);
  parts.push(`${progress.violationCount} violation${progress.violationCount === 1 ? "" : "s"} found so far`);
  return parts.join(" · ");
}

export function reportView({ report, loading = false, error = null, progress = null } = {}) {
  if (error) {
    const message =
      typeof error === "string" ? error : (error?.message ?? "The analysis could not be completed.");
    return { kind: "error", label: "Error", className: "is-error", message };
  }
  if (loading) {
    return {
      kind: "loading",
      label: "Loading",
      className: "is-loading",
      message: formatAnalyzingMessage(progress),
    };
  }
  if (!report) {
    return {
      kind: "idle",
      label: "Idle",
      className: "is-idle",
      message:
        "No report yet. Run a live call, upload audio, or pick a sample to generate one.",
    };
  }
  const verdict = headlineVerdict(report.findings ?? []);
  return {
    kind: "ready",
    label: verdict.label,
    level: verdict.level,
    className: VERDICT_CLASS[verdict.level] ?? "is-review",
    flaggedCount: verdict.flaggedCount,
    message: null,
  };
}
