// plivo — small Plivo API helpers.
// Currently exposes checkTransferOutcome(): given the parent CallUUID, queries
// Plivo for child calls (the dial leg created by our transfer-xml endpoint) and
// determines whether the manager actually answered.
//
// Why this matters: Plivo's transfer API returns 202 Accepted the moment it
// receives the request — well before the manager picks up (or doesn't). Without
// this check, the post-call webhook can't tell "manager bridged" from "caller
// hung up before bridge" or "manager didn't answer." See the false ✅ TRANSFERRED
// Telegram cases on May 20 (calls 7bf6b43c, etc.) for the bug this fixes.

export interface TransferOutcome {
  attempted: boolean;            // true if any child/dial leg exists in Plivo
  bridged: boolean;              // true if a child leg answered + had non-trivial duration
  reason: string;
  child_duration?: number;
  hangup_source?: string | null;
}

export async function checkTransferOutcome(callUuid: string): Promise<TransferOutcome> {
  const authId = Deno.env.get("PLIVO_AUTH_ID");
  const authToken = Deno.env.get("PLIVO_AUTH_TOKEN");
  if (!authId || !authToken) {
    console.warn("plivo_check_missing_creds");
    return { attempted: false, bridged: false, reason: "missing_plivo_creds" };
  }

  const basicAuth = btoa(`${authId}:${authToken}`);
  const url = `https://api.plivo.com/v1/Account/${authId}/Call/?parent_call_uuid=${encodeURIComponent(callUuid)}&limit=10`;

  try {
    const resp = await fetch(url, {
      headers: { Authorization: `Basic ${basicAuth}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.warn("plivo_check_http_err", { status: resp.status, body: text.slice(0, 200) });
      return { attempted: false, bridged: false, reason: `plivo_query_${resp.status}` };
    }

    const data = await resp.json();
    const children: any[] = data?.objects ?? [];
    console.log({ event: "plivo_transfer_check", call_uuid: callUuid, child_count: children.length });

    if (children.length === 0) {
      // No dial leg ever created — Maya never invoked transfer_call OR Plivo didn't dial.
      return { attempted: false, bridged: false, reason: "no_dial_leg" };
    }

    // Look for an answered child with non-trivial duration (3s threshold filters out ring-then-cancel).
    for (const c of children) {
      const answered = (c.call_state === "ANSWER" || c.end_time) && (c.bill_duration ?? 0) > 3;
      if (answered) {
        return {
          attempted: true,
          bridged: true,
          reason: "bridged",
          child_duration: c.bill_duration,
          hangup_source: c.hangup_source,
        };
      }
    }

    const c = children[0];
    return {
      attempted: true,
      bridged: false,
      reason: c?.hangup_cause_name || c?.call_state || "no_answer",
      child_duration: c?.bill_duration,
      hangup_source: c?.hangup_source ?? null,
    };
  } catch (e) {
    console.error("plivo_check_threw", e);
    return { attempted: false, bridged: false, reason: "plivo_query_exception" };
  }
}
