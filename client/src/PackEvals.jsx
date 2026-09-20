import { useEffect, useState } from "react";
import { runPackEvals } from "./evalsClient";

export default function PackEvals({ selectedPacks, catalog }) {
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const selected = catalog.filter((pack) => selectedPacks.includes(pack.id));
  const selectedKey = selected.map((pack) => pack.id).join(",");

  useEffect(() => {
    setRun(null);
    setError(null);
  }, [selectedKey]);

  if (selected.length === 0) {
    return <p className="pack-note">Check a pack to verify its identifier evals.</p>;
  }

  const onRun = async () => {
    setBusy(true);
    setError(null);
    try {
      setRun(await runPackEvals(selected.map((pack) => pack.id)));
    } catch (err) {
      setRun(null);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pack-evals">
      {selected.map((pack) =>
        pack.asserts ? (
          <p className="pack-note pack-evals-asserts" key={pack.id}>
            {pack.name}: {pack.asserts}
          </p>
        ) : null,
      )}
      <button type="button" className="btn" onClick={onRun} disabled={busy}>
        {busy ? "Running evals…" : `Verify ${selected.length === 1 ? selected[0].name : "selected packs"}`}
      </button>
      {error && <p className="banner-error">{error}</p>}
      {run && (
        <div className="pack-evals-run">
          <p className="pack-evals-summary">
            {run.passed} passed, {run.failed} failed
            {run.judge === "synthetic-offline" ? " · no live model" : ""}
          </p>
          {run.suites.map((suite) => (
            <div key={suite.packId} className="pack-evals-suite">
              <h3>
                {suite.packName} — {suite.passed} passed, {suite.failed} failed
              </h3>
              <ul className="pack-evals-cases">
                {suite.cases.map((cse) => (
                  <li key={cse.id} className={cse.passed ? "is-pass" : "is-flag"}>
                    <span>{cse.passed ? "✓" : "✗"}</span> {cse.title}
                    {!cse.passed && (
                      <span className="pack-evals-fail-detail">
                        {" "}
                        {[...cse.enabled.checkpoints, ...cse.ownerOmitted.checkpoints]
                          .filter((cp) => !cp.passed)
                          .map((cp) => cp.detail)
                          .join("; ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
