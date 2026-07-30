"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createOrbitActionKey,
  revokeOrbitActionKey,
} from "@/lib/orbit-actions";
import { requireFounderFoundry } from "@/lib/foundry";

export type OrbitActionKeyState = {
  token: string | null;
  prefix: string | null;
  error: string | null;
};

export const initialOrbitActionKeyState: OrbitActionKeyState = {
  token: null,
  prefix: null,
  error: null,
};

export async function createOrbitActionKeyAction(
  _previousState: OrbitActionKeyState,
  formData: FormData,
): Promise<OrbitActionKeyState> {
  const parsed = z
    .object({
      name: z.string().trim().min(2).max(120),
      expiryDays: z.coerce.number().int().min(1).max(365),
    })
    .safeParse({
      name: String(formData.get("name") ?? ""),
      expiryDays: String(formData.get("expiryDays") ?? "90"),
    });

  if (!parsed.success) {
    return {
      token: null,
      prefix: null,
      error: "Key name aur expiry dobara check karein.",
    };
  }

  try {
    const { workspace, user } = await requireFounderFoundry();
    const expiresAt = new Date(
      Date.now() + parsed.data.expiryDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    const result = await createOrbitActionKey({
      workspaceId: workspace.id,
      actorId: user.id,
      name: parsed.data.name,
      expiresAt,
    });

    revalidatePath("/dashboard/foundry/integrations");
    return {
      token: result.token,
      prefix: result.key.token_prefix,
      error: null,
    };
  } catch {
    return {
      token: null,
      prefix: null,
      error: "Orbit Action key create nahi hui. Server configuration check karein.",
    };
  }
}

export async function revokeOrbitActionKeyAction(formData: FormData) {
  const keyId = z.string().uuid().safeParse(String(formData.get("keyId") ?? ""));
  if (!keyId.success) return;

  const { workspace } = await requireFounderFoundry();
  await revokeOrbitActionKey({
    workspaceId: workspace.id,
    keyId: keyId.data,
  });
  revalidatePath("/dashboard/foundry/integrations");
}
