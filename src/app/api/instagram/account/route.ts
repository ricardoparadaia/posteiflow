import { NextResponse } from "next/server";
import { getActiveInstagramAccount } from "@/lib/account";
import { getAccountInfo, getPublishingLimit } from "@/lib/instagram";

export const dynamic = "force-dynamic";

export async function GET() {
  const account = await getActiveInstagramAccount();
  if (!account) {
    return NextResponse.json({ connected: false });
  }

  const base = {
    connected: true,
    ig_user_id: account.ig_user_id,
    username: account.username,
    access_token_masked: maskToken(account.access_token),
    token_expires_at: account.token_expires_at,
    token_last_refreshed_at: account.token_last_refreshed_at,
    token_source: account.token_source,
    connected_at: account.connected_at,
  };

  const tokenExpired = account.token_expires_at
    ? new Date(account.token_expires_at) <= new Date()
    : false;

  if (tokenExpired) {
    return NextResponse.json({ ...base, tokenExpired: true });
  }

  try {
    const [info, limit] = await Promise.all([
      getAccountInfo(account.ig_user_id, account.access_token),
      getPublishingLimit(account.ig_user_id, account.access_token),
    ]);

    return NextResponse.json({
      ...base,
      followersCount: info.followersCount,
      mediaCount: info.mediaCount,
      publishingLimit: limit,
    });
  } catch (err) {
    return NextResponse.json({
      ...base,
      liveDataError: err instanceof Error ? err.message : String(err),
    });
  }
}

function maskToken(token: string) {
  if (token.length <= 8) return "••••••••";
  return `${token.slice(0, 4)}${"•".repeat(12)}${token.slice(-4)}`;
}
