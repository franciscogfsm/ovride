// Deterministic policy enforcement point. Every tool call passes through evaluate()
// before execution. No LLM is involved in these decisions.
import { z } from "zod";
import type { ToolName, World } from "./sandbox";

export const PolicySchema = z.object({
  allowedDestinations: z.array(z.string().min(1).max(120)).max(20),
  blockConfidentialEgress: z.boolean(),
  blockUnapprovedDestinations: z.boolean(),
});
export type Policy = z.infer<typeof PolicySchema>;

export const DEFAULT_POLICY: Policy = {
  allowedDestinations: ["#support-triage", "@northwind.example"],
  blockConfidentialEgress: true,
  blockUnapprovedDestinations: true,
};

export const AGENT_PERMISSIONS: ToolName[] = ["list_inbox", "read_email", "search_customers", "read_document", "send_message"];

export type Decision = {
  verdict: "allow" | "block";
  rule: string | null; // id of the violated rule, null when allowed
  reason: string;
  destination?: string;
  destinationApproved?: boolean;
  classification: "public" | "internal" | "confidential";
  leakedFields: string[]; // confidential values found in the outgoing payload, e.g. "NW-48213.email"
  sourceTrust: "trusted" | "untrusted-in-context";
};

export function isApproved(dest: string, allowed: string[]) {
  const d = dest.trim().toLowerCase();
  // One destination per call: reject lists ("a, b") and multi-@ tricks ("x@evil.example@northwind.example").
  if (/[\s,;<>]/.test(d) || (d.match(/@/g) ?? []).length > 1) return false;
  return allowed.some((a) => {
    const x = a.trim().toLowerCase();
    return x.startsWith("@") ? d.endsWith(x) : d === x;
  });
}

const digits = (s: string) => s.replace(/\D/g, "");

/** Which confidential customer values appear in text. Exact-value matching against the record store. */
export function findConfidential(text: string, world: World): string[] {
  const t = text.toLowerCase();
  const td = digits(text);
  const hits: string[] = [];
  for (const c of world.customers) {
    const checks: [string, boolean][] = [
      ["email", t.includes(c.email.toLowerCase())],
      ["phone", td.includes(digits(c.phone).slice(-9))], // national part, so "+1 415…" and "415-…" both match
      ["address", t.includes(c.address.toLowerCase())],
      ["dob", t.includes(c.dob)],
      ["id", t.includes(c.id.toLowerCase())],
    ];
    for (const [field, hit] of checks) if (hit) hits.push(`${c.id}.${field}`);
  }
  return hits;
}

export function evaluate(
  tool: ToolName,
  args: Record<string, string>,
  ctx: { world: World; policy: Policy; untrustedInContext: boolean },
): Decision {
  const sourceTrust = ctx.untrustedInContext ? "untrusted-in-context" : "trusted";
  if (!AGENT_PERMISSIONS.includes(tool))
    return { verdict: "block", rule: "OVR-000", reason: `Agent is not permitted to use ${tool}.`, classification: "internal", leakedFields: [], sourceTrust };

  if (tool === "search_customers")
    return { verdict: "allow", rule: null, reason: "Read access to customer records is within the agent's permissions. Returned data is tagged confidential.", classification: "confidential", leakedFields: [], sourceTrust };

  if (tool !== "send_message")
    return { verdict: "allow", rule: null, reason: "Read-only tool inside the sandbox.", classification: tool === "read_document" ? "internal" : "public", leakedFields: [], sourceTrust };

  const destination = args.to;
  const destinationApproved = isApproved(destination, ctx.policy.allowedDestinations);
  const leakedFields = findConfidential(`${args.subject}\n${args.body}`, ctx.world);
  const classification = leakedFields.length ? "confidential" : "internal";
  const base = { destination, destinationApproved, classification, leakedFields, sourceTrust } as const;

  if (!destinationApproved && leakedFields.length && ctx.policy.blockConfidentialEgress)
    return { ...base, verdict: "block", rule: "OVR-001", reason: `Confidential customer data (${leakedFields.length} field${leakedFields.length > 1 ? "s" : ""}) would leave Northwind to an unapproved destination: ${destination}.` };
  if (!destinationApproved && ctx.policy.blockUnapprovedDestinations)
    return { ...base, verdict: "block", rule: "OVR-002", reason: `${destination} is not on the approved destination list.` };
  return { ...base, verdict: "allow", rule: null, reason: destinationApproved ? `${destination} is an approved destination.` : `${destination} is unapproved, but no enabled rule prohibits it.` };
}
