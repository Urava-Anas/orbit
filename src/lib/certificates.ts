import "server-only";

import { z } from "zod";
import { createPublicClient } from "@/lib/supabase/public";

const tokenSchema = z.string().uuid();

export type VerifiedFoundryCertificate = {
  certificate_number: string;
  student_name: string;
  foundry_id: string;
  certificate_type: string;
  title: string;
  statement: string;
  issued_at: string;
  status: "issued" | "revoked";
  revoked_at: string | null;
};

export async function verifyFoundryCertificate(token: string) {
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) return null;
  const supabase = createPublicClient();
  const result = await supabase.rpc("verify_foundry_certificate", {
    target_verification_token: parsed.data,
  });
  if (result.error) return null;
  return (
    ((result.data ?? [])[0] as VerifiedFoundryCertificate | undefined) ?? null
  );
}
