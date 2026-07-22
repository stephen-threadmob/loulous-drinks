import "server-only";
import twilio from "twilio";
import { serverEnv } from "@/lib/env";
import { splitSms } from "./format";

export interface SendResult {
  status: "sent" | "failed" | "skipped";
  segments: number;
  providerSid?: string;
  error?: string;
}

// Send an order notification SMS (possibly split into numbered parts). Degrades
// gracefully: if Twilio isn't configured or there's no recipient, returns
// "skipped" so the order still succeeds and the dashboard can flag it.
export async function sendOrderSms(
  toNumber: string | null | undefined,
  body: string
): Promise<SendResult> {
  const { twilioAccountSid, twilioAuthToken, twilioFromNumber } = serverEnv();

  if (!toNumber) {
    return { status: "skipped", segments: 0, error: "No owner phone configured." };
  }
  if (!twilioAccountSid || !twilioAuthToken || !twilioFromNumber) {
    return {
      status: "skipped",
      segments: 0,
      error: "Twilio is not configured (missing credentials).",
    };
  }

  const parts = splitSms(body);
  try {
    const client = twilio(twilioAccountSid, twilioAuthToken);
    let lastSid: string | undefined;
    for (const part of parts) {
      const msg = await client.messages.create({
        to: toNumber,
        from: twilioFromNumber,
        body: part,
      });
      lastSid = msg.sid;
    }
    return { status: "sent", segments: parts.length, providerSid: lastSid };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown Twilio error";
    // Log server-side; never surface provider internals to the customer.
    console.error("Twilio send failed:", message);
    return { status: "failed", segments: parts.length, error: message };
  }
}
