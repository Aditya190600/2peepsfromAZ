import * as twilioClient from "./twilioClient.js";
import * as store from "./store.js";
import { armStreamWatchdog } from "./streamWatchdog.js";
import { recordProductionCall } from "./productionCalls.js";

export { twilioConfigured } from "./twilioClient.js";

// Places the real outbound call for an approved scenario's run and moves the
// run into the 'in_progress' state. Fire-and-forget from the router (see
// server/qualeval/router.js's POST /scenarios/:id/runs), dispatched off the
// fast-ack response path the same way server/webhooks/ingest.js dispatches
// analysis - Twilio's call-create API returns as soon as the call is
// queued, well before it's answered, but the router still shouldn't block
// its response on a third-party API call.
//
// `fromNumber` is never hardcoded - it comes from QUALEVAL_PERSONA_NUMBER
// (the persona-pool number an operator configures once a real number
// exists; see AGENTS.md). Missing config fails the run honestly via
// markRunError rather than a fabricated in-progress state.
export async function placeCall(
  run,
  scenario,
  evaluation,
  {
    baseUrl,
    env = process.env,
    place = twilioClient.placeOutboundCall,
    markRunInProgress = store.markRunInProgress,
    markRunError = store.markRunError,
    watchdog = armStreamWatchdog,
    recordCall = recordProductionCall,
  } = {},
) {
  try {
    if (!twilioClient.twilioConfigured(env)) {
      throw new Error("Twilio is not configured (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN).");
    }
    const from = env.QUALEVAL_PERSONA_NUMBER;
    if (!from) throw new Error("QUALEVAL_PERSONA_NUMBER is not configured - no caller-ID number to dial from.");
    const to = evaluation.agentPhoneNumber;
    if (!to) throw new Error("This evaluation has no agentPhoneNumber to call.");

    const { sid } = await place(
      {
        to,
        from,
        twimlUrl: `${baseUrl}/v1/qualeval/twilio-voice/${run.id}`,
      },
      env,
    );
    await recordCall(
      {
        twilioCallSid: sid,
        direction: "outbound",
        fromNumber: from,
        toNumber: to,
        qualevalRunId: run.id,
      },
      env,
    ).catch((err) => {
      console.error(`QualEval call bridge: failed to record production call ${sid}: ${err.message}`);
    });
    const updated = await markRunInProgress(run.id, sid);
    // Guards against the run hanging in 'in_progress' forever if the Media
    // Stream WebSocket upgrade never reaches the app - see
    // server/qualeval/streamWatchdog.js's header comment.
    watchdog(run.id);
    return updated;
  } catch (err) {
    console.error(`QualEval call bridge: placeCall failed for run ${run.id}: ${err.message}`);
    return await markRunError(run.id, err.message).catch(() => null);
  }
}
