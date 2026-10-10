import { AccessToken } from "livekit-server-sdk";
import { NextResponse } from "next/server";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const room = searchParams.get("room");
  const username = searchParams.get("username");
  const isHost = searchParams.get("isHost") === "true";

  if (!room || !username) {
    return NextResponse.json(
      { error: "Room aur username zaroori hain" },
      { status: 400 }
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

  // Host aur Viewer dono ke liye permissions:
  at.addGrant({
    room: room,
    roomJoin: true,
    canPublish: isHost,        // Sirf Host audio/video broadcast karega
    canPublishData: true,    // Host aur Viewer DONO chat aur reactions bhej sakein
    canSubscribe: true,      // Sabhi ek doosre ka data/stream dekh sakein
  });

  const token = await at.toJwt();
  return NextResponse.json({ token });
}