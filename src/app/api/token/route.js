import { AccessToken } from "livekit-server-sdk";
import { NextResponse } from "next/server";

// Aapka private Host password (ise badal bhi sakte hain)
const HOST_SECRET_PIN = "cjp@2026"; 

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const room = "cjp-live"; // Room fix ho gaya
  const username = searchParams.get("username");
  const isHost = searchParams.get("isHost") === "true";
  const pin = searchParams.get("pin");

  if (!username) {
    return NextResponse.json(
      { error: "Naam daalna zaroori hai" },
      { status: 400 }
    );
  }

  // Agar koi Host banne ki koshish kare aur PIN galat ho
  if (isHost && pin !== HOST_SECRET_PIN) {
    return NextResponse.json(
      { error: "Galat Host PIN! Sirf official host broadcast kar sakta hai." },
      { status: 403 }
    );
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "Server keys configure nahi hain" },
      { status: 500 }
    );
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: username,
    name: username,
  });

  at.addGrant({
    room: room,
    roomJoin: true,
    canPublish: isHost,     // Sirf valid PIN wala Host broadcast karega
    canPublishData: true,   // Chat aur reactions sabhi bhej sakte hain
    canSubscribe: true,
  });

  const token = await at.toJwt();
  return NextResponse.json({ token });
}