"use client";

import { useState, useRef, useEffect } from "react";
import { Room, RoomEvent, Track } from "livekit-client";

export default function LivePortal() {
  const [userName, setUserName] = useState("");
  const [roomName, setRoomName] = useState("cjp-live");
  const [isHost, setIsHost] = useState(false);
  const [inRoom, setInRoom] = useState(false);
  const [status, setStatus] = useState("");
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");

  // Host Controls State
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const roomRef = useRef(null);
  const videoRef = useRef(null);

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

      setStatus("Room se connect kiya ja raha hai...");
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      roomRef.current = room;

      // Remote participants track listener (Viewer ke liye video)
      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind === Track.Kind.Video && videoRef.current) {
          track.attach(videoRef.current);
        }
      });

      // Track unpublish listener
      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach();
      });

      // Data/Chat message listener
      room.on(RoomEvent.DataReceived, (payload, participant) => {
        try {
          const strData = new TextDecoder().decode(payload);
          const msgObj = JSON.parse(strData);
          setMessages((prev) => [...prev, msgObj]);
        } catch (err) {
          console.error("Chat parse error", err);
        }
      });

      const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
      await room.connect(livekitUrl, data.token);

      // Agar Host hai toh Camera aur Mic chalu karo
      if (isHost) {
        setStatus("Camera aur Mic shuru ho raha hai...");
        await room.localParticipant.enableCameraAndMicrophone();

        const videoTrackPublication = Array.from(
          room.localParticipant.videoTrackPublications.values()
        )[0];

        if (videoTrackPublication && videoTrackPublication.track && videoRef.current) {
          videoTrackPublication.track.attach(videoRef.current);
        }
      }

      setInRoom(true);
      setStatus(isHost ? "Live Streaming On Air! 🔴" : "Streaming dekh rahe hain! 📺");
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
  };

  // Host Toggle Controls
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

  // Send Chat Message
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !roomRef.current) return;

    const msgObj = {
      sender: userName,
      text: chatInput.trim(),
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(msgObj));

    await roomRef.current.localParticipant.publishData(data, { reliable: true });
    setMessages((prev) => [...prev, msgObj]);
    setChatInput("");
  };

  useEffect(() => {
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect();
      }
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4 font-sans">
      <h1 className="text-2xl md:text-3xl font-bold mb-6 text-blue-400">
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
              placeholder="Ex: Rahul"
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
          {/* Main Video Section */}
          <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col shadow-xl">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-semibold flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
                Room: <span className="text-blue-400">{roomName}</span>
              </span>
              <button
                onClick={leaveRoom}
                className="bg-red-600 hover:bg-red-700 text-xs px-3 py-1.5 rounded-md font-medium transition"
              >
                Leave Stream ✕
              </button>
            </div>

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
            </div>

            {/* Host Controls */}
            {isHost && (
              <div className="flex flex-wrap gap-2 justify-center mt-4">
                <button
                  type="button"
                  onClick={toggleMic}
                  className={`px-3 py-2 rounded-lg font-medium text-xs sm:text-sm ${
                    isMuted ? "bg-red-600 hover:bg-red-700" : "bg-slate-800 hover:bg-slate-700"
                  } text-white border border-slate-700 transition`}
                >
                  {isMuted ? "Unmute Mic 🎤" : "Mute Mic 🎙️"}
                </button>

                <button
                  type="button"
                  onClick={toggleCamera}
                  className={`px-3 py-2 rounded-lg font-medium text-xs sm:text-sm ${
                    isVideoOff ? "bg-red-600 hover:bg-red-700" : "bg-slate-800 hover:bg-slate-700"
                  } text-white border border-slate-700 transition`}
                >
                  {isVideoOff ? "Turn On Camera 📹" : "Turn Off Camera 📷"}
                </button>

                <button
                  type="button"
                  onClick={toggleScreenShare}
                  className={`px-3 py-2 rounded-lg font-medium text-xs sm:text-sm ${
                    isScreenSharing ? "bg-amber-600 hover:bg-amber-700" : "bg-slate-800 hover:bg-slate-700"
                  } text-white border border-slate-700 transition`}
                >
                  {isScreenSharing ? "Stop Sharing 🛑" : "Share Screen 🖥️"}
                </button>
              </div>
            )}
          </div>

          {/* Live Chat Section */}
          <div className="w-full lg:w-80 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col h-96 lg:h-auto shadow-xl">
            <h2 className="text-sm font-semibold border-b border-slate-800 pb-2 mb-3 text-slate-300">
              Live Chat 💬
            </h2>

            <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1 text-xs">
              {messages.length === 0 ? (
                <p className="text-slate-500 italic text-center my-auto">
                  Abhi koi message nahi aaya...
                </p>
              ) : (
                messages.map((m, idx) => (
                  <div key={idx} className="bg-slate-800/80 p-2 rounded-lg border border-slate-700/50">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="font-semibold text-blue-400">{m.sender}</span>
                      <span className="text-[10px] text-slate-500">{m.time}</span>
                    </div>
                    <p className="text-slate-200">{m.text}</p>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={sendMessage} className="flex gap-2 mt-3 pt-2 border-t border-slate-800">
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
        <p className="mt-4 text-xs text-yellow-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full shadow">
          {status}
        </p>
      )}
    </main>
  );
}