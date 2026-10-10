import { AccessToken } from "livekit-server-sdk";
import { NextResponse } from "next/server";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const room = searchParams.get("room") || "cjp-live";
  const identity = searchParams.get("identity") || `user-${Math.random().toString(36).substring(7)}`;
  const isHost = searchParams.get("isHost") === "true";

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    return NextResponse.json({ error: "Keys missing in .env.local" }, { status: 500 });
  }

  const at = new AccessToken(apiKey, apiSecret, { identity });
  at.addGrant({
    roomJoin: true,
    room,
    canPublish: isHost,
    canSubscribe: true,
  });

  return NextResponse.json({ token: await at.toJwt() });
}