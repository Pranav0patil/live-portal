"use client";

import { useState, useRef, useEffect } from "react";
import { Room, RoomEvent, Track, createLocalVideoTrack } from "livekit-client";

export default function LivePortal() {
  const [userName, setUserName] = useState("");
  const [roomName, setRoomName] = useState("cjp-live");
  const [isHost, setIsHost] = useState(false);
  const [inRoom, setInRoom] = useState(false);
  const [status, setStatus] = useState("");
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");

  // Live Status & Reactions
  const [viewerCount, setViewerCount] = useState(1);
  const [floatingReactions, setFloatingReactions] = useState([]);

  // Host Controls & Multi-Camera
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [videoDevices, setVideoDevices] = useState([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);

  const roomRef = useRef(null);
  const videoRef = useRef(null);

  // Available camera list nikalne ke liye
  const getCameras = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === "videoinput");
      setVideoDevices(cams);
    } catch (e) {
      console.error("Camera detect error:", e);
    }
  };

  const updateParticipantCount = (room) => {
    // Total log (Remote participants + 1 local user)
    setViewerCount(room.remoteParticipants.size + 1);
  };

  const triggerReactionAnimation = (emoji) => {
    const id = Date.now() + Math.random();
    setFloatingReactions((prev) => [...prev, { id, emoji }]);
    setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2000);
  };

  const joinRoom = async (e) => {
    e.preventDefault();
    if (!userName.trim() || !roomName.trim()) {
      alert("Kripya Naam aur Room Name bharein!");
      return;
    }

    try {
      setStatus("Token fetch kiya ja raha hai...");
      const res = await fetch(
        `/api/token?room=${encodeURIComponent(roomName)}&username=${encodeURIComponent(userName)}&isHost=${isHost}`
      );
      const data = await res.json();

      if (!res.ok || !data.token) {
        throw new Error(data.error || "Token fetch fail ho gaya");
      }

      setStatus("Connecting to room...");
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      roomRef.current = room;

      // 1. Viewer ke liye Host ka video attach karna
      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind === Track.Kind.Video && videoRef.current) {
          track.attach(videoRef.current);
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach();
      });

      // 2. Real-time participant counter update
      room.on(RoomEvent.ParticipantConnected, () => updateParticipantCount(room));
      room.on(RoomEvent.ParticipantDisconnected, () => updateParticipantCount(room));

      // 3. Chat aur Reaction messages receive karna
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
      updateParticipantCount(room);

      // Agar Host hai toh local preview aur publishing shuru karein
      if (isHost) {
        setStatus("Host media shuru ho raha hai...");
        await room.localParticipant.enableCameraAndMicrophone();
        await getCameras();

        // Local Host preview attach karna
        const camTrack = Array.from(room.localParticipant.videoTrackPublications.values())[0]?.track;
        if (camTrack && videoRef.current) {
          camTrack.attach(videoRef.current);
        }
      }

      setInRoom(true);
      setStatus(isHost ? "🔴 Live Broadcast On Air" : "📺 Streaming Connected");
    } catch (err) {
      console.error(err);
      setStatus("Error: " + err.message);
    }
  };

  const leaveRoom = async () => {
    if (roomRef.current) {
      await roomRef.current.disconnect();
      roomRef.current = null;
    }
    setInRoom(false);
    setStatus("");
    setMessages([]);
    setIsMuted(false);
    setIsVideoOff(false);
    setIsScreenSharing(false);
    setVideoDevices([]);
  };

  // Host Mic Toggle
  const toggleMic = async () => {
    if (roomRef.current && isHost) {
      const enabled = roomRef.current.localParticipant.isMicrophoneEnabled;
      await roomRef.current.localParticipant.setMicrophoneEnabled(!enabled);
      setIsMuted(enabled);
    }
  };

  // Host Camera Toggle
  const toggleCamera = async () => {
    if (roomRef.current && isHost) {
      const enabled = roomRef.current.localParticipant.isCameraEnabled;
      await roomRef.current.localParticipant.setCameraEnabled(!enabled);
      setIsVideoOff(enabled);
    }
  };

  // Multi-Camera Switch (Front, Back 1, Back 2, Wide, etc.)
  const switchCamera = async () => {
    if (!roomRef.current || !isHost || videoDevices.length <= 1) return;

    try {
      const nextIndex = (currentCameraIndex + 1) % videoDevices.length;
      const nextDevice = videoDevices[nextIndex];

      const newTrack = await createLocalVideoTrack({
        deviceId: nextDevice.deviceId,
      });

      const currentPub = Array.from(
        roomRef.current.localParticipant.videoTrackPublications.values()
      )[0];

      if (currentPub) {
        await roomRef.current.localParticipant.unpublishTrack(currentPub.track);
        currentPub.track.stop();
      }

      await roomRef.current.localParticipant.publishTrack(newTrack);
      if (videoRef.current) {
        newTrack.attach(videoRef.current);
      }

      setCurrentCameraIndex(nextIndex);
    } catch (err) {
      console.error("Camera switch error:", err);
    }
  };

  // Screen Sharing Toggle
  const toggleScreenShare = async () => {
    if (roomRef.current && isHost) {
      try {
        const enabled = roomRef.current.localParticipant.isScreenShareEnabled;
        await roomRef.current.localParticipant.setScreenShareEnabled(!enabled);
        setIsScreenSharing(!enabled);
      } catch (e) {
        console.error("Screen share error:", e);
      }
    }
  };

  // Send Message (Host + Viewer dono use kar sakte hain)
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

  // Send Reaction (❤️, 🔥)
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
      <h1 className="text-xl md:text-2xl font-bold mb-4 text-blue-400">
        Live Streaming Portal
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
              placeholder="Ex: Pranav"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Room Name:</label>
            <input
              type="text"
              placeholder="cjp-live"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              required
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
              Mai Host (Broadcaster) banna chahta hu
            </label>
          </div>

          <button
            type="submit"
            className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg text-sm transition"
          >
            {isHost ? "Start Stream as Host 🚀" : "Join as Viewer 📺"}
          </button>
        </form>
      ) : (
        <div className="w-full max-w-5xl flex flex-col lg:flex-row gap-4">
          {/* Main Video Box */}
          <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl p-3 md:p-4 flex flex-col shadow-xl">
            {/* Header: Room Name, Viewer Count & Leave Button */}
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-3">
                <span className="text-xs md:text-sm font-semibold flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
                  {roomName}
                </span>
                <span className="text-xs bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full text-slate-300">
                  👥 {viewerCount} Live
                </span>
              </div>
              <button
                onClick={leaveRoom}
                className="bg-red-600 hover:bg-red-700 text-xs px-3 py-1.5 rounded-md font-medium transition"
              >
                Leave ✕
              </button>
            </div>

            {/* Video Player + Overlay Animations */}
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center">
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

              {/* Floating Reaction Animation Layer */}
              <div className="absolute bottom-4 right-4 pointer-events-none flex flex-col-reverse items-center overflow-hidden h-48 w-16">
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

            {/* Reaction Buttons Bar (Har koi use kar sakta hai) */}
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

              {/* Multi-Camera Switch Button (Sirf Host aur Phone ke liye) */}
              {isHost && videoDevices.length > 1 && (
                <button
                  type="button"
                  onClick={switchCamera}
                  className="bg-blue-600 hover:bg-blue-700 text-xs px-3 py-1.5 rounded-lg font-medium transition"
                >
                  🔄 Switch Cam ({currentCameraIndex + 1}/{videoDevices.length})
                </button>
              )}
            </div>

            {/* Host Controls */}
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

          {/* Chat Window */}
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