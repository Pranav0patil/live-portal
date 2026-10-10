"use client";

import { useState, useRef, useEffect } from "react";
import {
  Room,
  RoomEvent,
  Track,
  createLocalTracks,
  createLocalVideoTrack,
} from "livekit-client";

const resolution4K = {
  width: 3840,
  height: 2160,
  frameRate: 30,
};

const encoding4K = {
  maxBitrate: 8_000_000,
  maxFramerate: 30,
};

export default function LivePortal() {
  const [userName, setUserName] = useState("");
  const roomName = "cjp-live"; // Single fixed official room
  const [isHost, setIsHost] = useState(false);
  const [hostPin, setHostPin] = useState("");
  const [inRoom, setInRoom] = useState(false);
  const [status, setStatus] = useState("");
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");

  const [viewerCount, setViewerCount] = useState(1);
  const [floatingReactions, setFloatingReactions] = useState([]);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [facingMode, setFacingMode] = useState("user");

  const roomRef = useRef(null);
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const videoContainerRef = useRef(null);
  const localVideoTrackRef = useRef(null);

  const updateParticipantCount = (room) => {
    setViewerCount(room.remoteParticipants.size + 1);
  };

  const triggerReactionAnimation = (emoji) => {
    const id = Date.now() + Math.random();
    setFloatingReactions((prev) => [...prev, { id, emoji }]);
    setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2000);
  };

  const attachTrackSafely = (track) => {
    if (track.kind === Track.Kind.Video && videoRef.current) {
      track.attach(videoRef.current);
      videoRef.current.play().catch(() => {});
    } else if (track.kind === Track.Kind.Audio && audioRef.current) {
      track.attach(audioRef.current);
      audioRef.current.play().catch(() => {});
    }
  };

  const joinRoom = async (e) => {
    e.preventDefault();
    if (!userName.trim()) {
      alert("Kripya apna naam bharein!");
      return;
    }

    if (isHost && !hostPin.trim()) {
      alert("Host banne ke liye Host Secret PIN daalna zaroori hai!");
      return;
    }

    try {
      setStatus("Verifying credentials...");
      const res = await fetch(
        `/api/token?username=${encodeURIComponent(userName)}&isHost=${isHost}&pin=${encodeURIComponent(hostPin)}`
      );
      const data = await res.json();

      if (!res.ok || !data.token) {
        throw new Error(data.error || "Connection fail ho gaya");
      }

      setStatus("Room se connect ho raha hai...");
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        autoSubscribe: true,
        videoCaptureDefaults: {
          resolution: resolution4K,
        },
        publishDefaults: {
          videoCodec: "vp8",
          simulcast: true,
        },
      });
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track) => {
        attachTrackSafely(track);
      });

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach();
      });

      room.on(RoomEvent.ParticipantConnected, () => updateParticipantCount(room));
      room.on(RoomEvent.ParticipantDisconnected, () => updateParticipantCount(room));

      room.on(RoomEvent.DataReceived, (payload) => {
        try {
          const str = new TextDecoder().decode(payload);
          const dataObj = JSON.parse(str);

          if (dataObj.type === "chat") {
            setMessages((prev) => [...prev, dataObj.message]);
          } else if (dataObj.type === "reaction") {
            triggerReactionAnimation(dataObj.emoji);
          }
        } catch (err) {
          console.error("Data decode error", err);
        }
      });

      const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
      await room.connect(livekitUrl, data.token);

      setInRoom(true);
      updateParticipantCount(room);

      if (isHost) {
        setStatus("Host Camera activate ho raha hai...");

        const localTracks = await createLocalTracks({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: {
            facingMode: "user",
            resolution: resolution4K,
          },
        });

        for (const track of localTracks) {
          await room.localParticipant.publishTrack(track, {
            videoEncoding: encoding4K,
          });

          if (track.kind === Track.Kind.Video) {
            localVideoTrackRef.current = track;
            setTimeout(() => {
              if (videoRef.current) {
                track.attach(videoRef.current);
                videoRef.current.play().catch(() => {});
              }
            }, 100);
          }
        }
      } else {
        setTimeout(() => {
          room.remoteParticipants.forEach((p) => {
            p.trackPublications.forEach((pub) => {
              if (pub.track) {
                attachTrackSafely(pub.track);
              }
            });
          });
        }, 300);
      }

      setStatus(isHost ? "🔴 CJP Official Broadcast LIVE" : "📺 Watching CJP Live");
    } catch (err) {
      console.error(err);
      setStatus("Error: " + err.message);
      alert(err.message);
    }
  };

  const leaveRoom = async () => {
    if (roomRef.current) {
      await roomRef.current.disconnect();
      roomRef.current = null;
    }
    if (localVideoTrackRef.current) {
      localVideoTrackRef.current.stop();
      localVideoTrackRef.current = null;
    }
    setInRoom(false);
    setStatus("");
    setMessages([]);
    setIsMuted(false);
    setIsVideoOff(false);
    setIsScreenSharing(false);
    setFacingMode("user");
  };

  const toggleMic = async () => {
    if (roomRef.current && isHost) {
      const enabled = roomRef.current.localParticipant.isMicrophoneEnabled;
      await roomRef.current.localParticipant.setMicrophoneEnabled(!enabled);
      setIsMuted(enabled);
    }
  };

  const toggleCamera = async () => {
    if (roomRef.current && isHost) {
      const enabled = roomRef.current.localParticipant.isCameraEnabled;
      await roomRef.current.localParticipant.setCameraEnabled(!enabled);
      setIsVideoOff(enabled);
    }
  };

  const toggleCameraFacing = async () => {
    if (!roomRef.current || !isHost) return;

    try {
      const nextMode = facingMode === "user" ? "environment" : "user";
      const currentPub = Array.from(
        roomRef.current.localParticipant.videoTrackPublications.values()
      )[0];

      if (currentPub && currentPub.track) {
        await roomRef.current.localParticipant.unpublishTrack(currentPub.track);
        currentPub.track.stop();
      }

      const newTrack = await createLocalVideoTrack({
        facingMode: { ideal: nextMode },
        resolution: resolution4K,
      });

      await roomRef.current.localParticipant.publishTrack(newTrack, {
        videoEncoding: encoding4K,
      });
      localVideoTrackRef.current = newTrack;

      if (videoRef.current) {
        newTrack.attach(videoRef.current);
        videoRef.current.play().catch(() => {});
      }

      setFacingMode(nextMode);
    } catch (err) {
      console.error("Camera switch error:", err);
    }
  };

  const toggleScreenShare = async () => {
    if (roomRef.current && isHost) {
      try {
        const enabled = roomRef.current.localParticipant.isScreenShareEnabled;
        await roomRef.current.localParticipant.setScreenShareEnabled(!enabled, {
          resolution: resolution4K,
        });
        setIsScreenSharing(!enabled);
      } catch (e) {
        console.error("Screen share error:", e);
      }
    }
  };

  const toggleLandscapeFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (videoContainerRef.current?.requestFullscreen) {
          await videoContainerRef.current.requestFullscreen();
        }
        if (screen.orientation && screen.orientation.lock) {
          screen.orientation.lock("landscape").catch(() => {});
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
        if (screen.orientation && screen.orientation.unlock) {
          screen.orientation.unlock();
        }
      }
    } catch (err) {
      console.log("Landscape mode error:", err);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !roomRef.current) return;

    const msgObj = {
      sender: userName,
      role: isHost ? "Host" : "Viewer",
      text: chatInput.trim(),
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const payload = JSON.stringify({ type: "chat", message: msgObj });
    const encoder = new TextEncoder();
    await roomRef.current.localParticipant.publishData(encoder.encode(payload), { reliable: true });

    setMessages((prev) => [...prev, msgObj]);
    setChatInput("");
  };

  const sendReaction = async (emoji) => {
    if (!roomRef.current) return;

    triggerReactionAnimation(emoji);
    const payload = JSON.stringify({ type: "reaction", emoji });
    const encoder = new TextEncoder();
    await roomRef.current.localParticipant.publishData(encoder.encode(payload), { reliable: false });
  };

  useEffect(() => {
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect();
      }
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-3 font-sans">
      <audio ref={audioRef} autoPlay />

      <h1 className="text-xl md:text-2xl font-bold mb-4 text-blue-400">
        CJP Live Streaming Portal
      </h1>

      {!inRoom ? (
        <form
          onSubmit={joinRoom}
          className="bg-slate-900 border border-slate-800 p-6 rounded-xl w-full max-w-sm flex flex-col gap-4 shadow-xl"
        >
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Aapka Naam:</label>
            <input
              type="text"
              placeholder="Ex: Viewer Name / Pranav"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Official Channel:</label>
            <input
              type="text"
              value="cjp-live"
              disabled
              className="w-full bg-slate-800/50 border border-slate-700 px-3 py-2 rounded-lg text-sm text-slate-400 cursor-not-allowed font-semibold"
            />
          </div>

          <div className="flex items-center gap-2 mt-1">
            <input
              type="checkbox"
              id="hostCheck"
              checked={isHost}
              onChange={(e) => setIsHost(e.target.checked)}
              className="w-4 h-4 rounded cursor-pointer accent-blue-600"
            />
            <label htmlFor="hostCheck" className="text-xs text-slate-300 cursor-pointer">
              Mai Host (Broadcaster) hu
            </label>
          </div>

          {/* Host PIN Input sirf Host tick karne par aayega */}
          {isHost && (
            <div>
              <label className="text-xs text-amber-400 mb-1 block">Host Secret PIN:</label>
              <input
                type="password"
                placeholder="Enter secret PIN"
                value={hostPin}
                onChange={(e) => setHostPin(e.target.value)}
                className="w-full bg-slate-800 border border-amber-500/50 px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-amber-400"
                required
              />
            </div>
          )}

          <button
            type="submit"
            className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg text-sm transition"
          >
            {isHost ? "Login & Go Live 🚀" : "Watch CJP Live 📺"}
          </button>
        </form>
      ) : (
        <div className="w-full max-w-5xl flex flex-col lg:flex-row gap-4">
          <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl p-3 md:p-4 flex flex-col shadow-xl">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-3">
                <span className="text-xs md:text-sm font-semibold flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
                  CJP Official Live
                </span>
                <span className="text-xs bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full text-slate-300">
                  👥 {viewerCount} Watching
                </span>
                <span className="text-[10px] bg-purple-950 border border-purple-700 text-purple-300 px-2 py-0.5 rounded-full font-bold">
                  4K UHD
                </span>
              </div>
              <button
                onClick={leaveRoom}
                className="bg-red-600 hover:bg-red-700 text-xs px-3 py-1.5 rounded-md font-medium transition"
              >
                Leave ✕
              </button>
            </div>

            <div
              ref={videoContainerRef}
              className="relative aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center"
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={isHost}
                className="w-full h-full object-cover"
              />

              {isVideoOff && isHost && (
                <div className="absolute inset-0 bg-slate-900 flex items-center justify-center text-slate-400 text-sm">
                  Camera is turned off
                </div>
              )}

              <button
                type="button"
                onClick={toggleLandscapeFullscreen}
                className="absolute top-2 right-2 bg-black/60 hover:bg-black/90 text-white p-1.5 rounded-md text-xs border border-white/20 transition z-10"
                title="Landscape / Fullscreen"
              >
                🔄 Landscape ⛶
              </button>

              <div className="absolute bottom-4 right-4 pointer-events-none flex flex-col-reverse items-center overflow-hidden h-48 w-16 z-10">
                {floatingReactions.map((r) => (
                  <span
                    key={r.id}
                    className="text-2xl animate-bounce transition-all duration-1000 transform -translate-y-8"
                  >
                    {r.emoji}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => sendReaction("❤️")}
                  className="bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-full text-sm transition active:scale-95"
                >
                  ❤️ Like
                </button>
                <button
                  type="button"
                  onClick={() => sendReaction("🔥")}
                  className="bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-full text-sm transition active:scale-95"
                >
                  🔥 Fire
                </button>
              </div>

              {isHost && (
                <button
                  type="button"
                  onClick={toggleCameraFacing}
                  className="bg-blue-600 hover:bg-blue-700 text-xs px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5"
                >
                  🔄 Flip Cam ({facingMode === "user" ? "Front" : "Back"})
                </button>
              )}
            </div>

            {isHost && (
              <div className="flex flex-wrap gap-2 justify-center mt-3 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={toggleMic}
                  className={`px-3 py-1.5 rounded-lg font-medium text-xs ${
                    isMuted ? "bg-red-600" : "bg-slate-800"
                  } border border-slate-700 text-white transition`}
                >
                  {isMuted ? "Unmute Mic 🎤" : "Mute 🎙️"}
                </button>

                <button
                  type="button"
                  onClick={toggleCamera}
                  className={`px-3 py-1.5 rounded-lg font-medium text-xs ${
                    isVideoOff ? "bg-red-600" : "bg-slate-800"
                  } border border-slate-700 text-white transition`}
                >
                  {isVideoOff ? "Camera On 📹" : "Camera Off 📷"}
                </button>

                <button
                  type="button"
                  onClick={toggleScreenShare}
                  className={`px-3 py-1.5 rounded-lg font-medium text-xs ${
                    isScreenSharing ? "bg-amber-600" : "bg-slate-800"
                  } border border-slate-700 text-white transition`}
                >
                  {isScreenSharing ? "Stop Sharing 🛑" : "Share Screen 🖥️"}
                </button>
              </div>
            )}
          </div>

          <div className="w-full lg:w-80 bg-slate-900 border border-slate-800 rounded-xl p-3 md:p-4 flex flex-col h-80 lg:h-auto shadow-xl">
            <h2 className="text-xs md:text-sm font-semibold border-b border-slate-800 pb-2 mb-2 text-slate-300">
              Live Chat 💬
            </h2>

            <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1 text-xs">
              {messages.length === 0 ? (
                <p className="text-slate-500 italic text-center my-auto">
                  Abhi koi message nahi hai...
                </p>
              ) : (
                messages.map((m, idx) => (
                  <div key={idx} className="bg-slate-800/80 p-2 rounded-lg border border-slate-700/50">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="font-semibold text-blue-400 flex items-center gap-1">
                        {m.sender}
                        {m.role === "Host" && (
                          <span className="text-[9px] bg-red-600 text-white px-1 rounded">HOST</span>
                        )}
                      </span>
                      <span className="text-[10px] text-slate-500">{m.time}</span>
                    </div>
                    <p className="text-slate-200">{m.text}</p>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={sendMessage} className="flex gap-2 mt-2 pt-2 border-t border-slate-800">
              <input
                type="text"
                placeholder="Type a message..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-lg text-xs focus:outline-none focus:border-blue-500 text-white"
              />
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg text-xs font-medium transition"
              >
                Send
              </button>
            </form>
          </div>
        </div>
      )}

      {status && (
        <p className="mt-3 text-xs text-yellow-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full shadow">
          {status}
        </p>
      )}
    </main>
  );
}