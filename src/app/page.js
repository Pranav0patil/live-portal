"use client";

import { useState, useRef, useEffect } from "react";
import { Room, RoomEvent, createLocalTracks, Track } from "livekit-client";

export default function LivePortal() {
  const [roomName, setRoomName] = useState("cjp-live");
  const [userName, setUserName] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("");

  // Controls state
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // Chat state
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const roomRef = useRef(null);
  const screenTrackRef = useRef(null);
  const chatBottomRef = useRef(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const joinStream = async () => {
    if (!userName.trim()) {
      alert("Kripya apna naam dalein!");
      return;
    }

    try {
      setStatus("Token fetch kiya ja raha hai...");
      const res = await fetch(`/api/token?room=${roomName}&identity=${userName}&isHost=${isHost}`);
      const data = await res.json();

      if (!data.token) {
        throw new Error(data.error || "Token fetch karne me dikkat aayi");
      }

      setStatus("LiveKit se connect ho raha hai...");
      const room = new Room();
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Video && remoteVideoRef.current) {
          track.attach(remoteVideoRef.current);
        }
        if (track.kind === Track.Kind.Audio) {
          const audioElement = track.attach();
          document.body.appendChild(audioElement);
        }
      });

      // Data channel message receive (Live Chat)
      room.on(RoomEvent.DataReceived, (payload, participant) => {
        const decoder = new TextDecoder();
        const text = decoder.decode(payload);
        try {
          const newMsg = JSON.parse(text);
          setMessages((prev) => [...prev, newMsg]);
        } catch {
          setMessages((prev) => [...prev, { sender: participant?.identity || "Unknown", text }]);
        }
      });

      await room.connect(process.env.NEXT_PUBLIC_LIVEKIT_URL, data.token);
      setConnected(true);
      setStatus(isHost ? "Aap Live Broadcast kar rahe hain!" : "Aap Live Stream dekh rahe hain!");

      if (isHost) {
        const tracks = await createLocalTracks({ audio: true, video: true });
        for (const track of tracks) {
          await room.localParticipant.publishTrack(track);
          if (track.kind === Track.Kind.Video && localVideoRef.current) {
            track.attach(localVideoRef.current);
          }
        }
      }
    } catch (err) {
      console.error(err);
      setStatus("Error: " + err.message);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !roomRef.current) return;

    const msgObj = { sender: userName, text: chatInput };
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(msgObj));

    await roomRef.current.localParticipant.publishData(data, { reliable: true });
    setMessages((prev) => [...prev, msgObj]);
    setChatInput("");
  };

  const toggleMic = () => {
    if (!roomRef.current) return;
    const audioTrack = roomRef.current.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
    if (audioTrack) {
      if (isMuted) {
        audioTrack.unmute();
        setIsMuted(false);
      } else {
        audioTrack.mute();
        setIsMuted(true);
      }
    }
  };

  const toggleCamera = () => {
    if (!roomRef.current) return;
    const videoTrack = roomRef.current.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
    if (videoTrack) {
      if (isVideoOff) {
        videoTrack.unmute();
        setIsVideoOff(false);
      } else {
        videoTrack.mute();
        setIsVideoOff(true);
      }
    }
  };

  const toggleScreenShare = async () => {
    if (!roomRef.current) return;
    try {
      if (!isScreenSharing) {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = stream.getVideoTracks()[0];
        screenTrackRef.current = screenTrack;

        await roomRef.current.localParticipant.publishTrack(screenTrack);
        setIsScreenSharing(true);

        screenTrack.onended = () => {
          stopScreenShare();
        };
      } else {
        stopScreenShare();
      }
    } catch (err) {
      console.error("Screen share cancel kiya ya error:", err);
    }
  };

  const stopScreenShare = () => {
    if (screenTrackRef.current && roomRef.current) {
      roomRef.current.localParticipant.unpublishTrack(screenTrackRef.current);
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
      setIsScreenSharing(false);
    }
  };

  const leaveStream = () => {
    if (roomRef.current) {
      roomRef.current.disconnect();
    }
    setConnected(false);
    setIsMuted(false);
    setIsVideoOff(false);
    setIsScreenSharing(false);
    setMessages([]);
    setStatus("Stream se disconnect ho gaye.");
  };

  return (
    <main className="min-h-screen bg-slate-900 text-white flex flex-col items-center p-4">
      <h1 className="text-3xl font-bold mb-4 text-blue-400">Live Streaming Portal</h1>

      {!connected ? (
        <div className="bg-slate-800 p-6 rounded-lg shadow-lg w-full max-w-md flex flex-col gap-4 mt-8">
          <div>
            <label className="text-sm font-semibold">Aapka Naam:</label>
            <input
              type="text"
              className="w-full p-2 mt-1 rounded bg-slate-700 border border-slate-600 focus:outline-none focus:border-blue-500"
              placeholder="Ex: Rahul"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-semibold">Room Name:</label>
            <input
              type="text"
              className="w-full p-2 mt-1 rounded bg-slate-700 border border-slate-600 focus:outline-none focus:border-blue-500"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 mt-2">
            <input
              type="checkbox"
              id="hostCheck"
              className="w-4 h-4 text-blue-600 rounded"
              checked={isHost}
              onChange={(e) => setIsHost(e.target.checked)}
            />
            <label htmlFor="hostCheck" className="text-sm font-medium">
              Mai Host (Broadcaster) banna chahta hu
            </label>
          </div>

          <button
            onClick={joinStream}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded font-semibold transition"
          >
            {isHost ? "Go Live (Start Stream)" : "Join as Viewer"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col w-full max-w-6xl gap-4">
          <div className="flex items-center justify-between w-full bg-slate-800 p-3 rounded-lg">
            <div className="flex gap-2">
              {isHost && (
                <>
                  <button
                    onClick={toggleMic}
                    className={`px-3 py-1.5 rounded text-sm font-semibold transition ${
                      isMuted ? "bg-red-600 hover:bg-red-700" : "bg-slate-700 hover:bg-slate-600"
                    }`}
                  >
                    {isMuted ? "Unmute Mic" : "Mute Mic"}
                  </button>

                  <button
                    onClick={toggleCamera}
                    className={`px-3 py-1.5 rounded text-sm font-semibold transition ${
                      isVideoOff ? "bg-red-600 hover:bg-red-700" : "bg-slate-700 hover:bg-slate-600"
                    }`}
                  >
                    {isVideoOff ? "Video On" : "Video Off"}
                  </button>

                  <button
                    onClick={toggleScreenShare}
                    className={`px-3 py-1.5 rounded text-sm font-semibold transition ${
                      isScreenSharing ? "bg-purple-600 hover:bg-purple-700" : "bg-slate-700 hover:bg-slate-600"
                    }`}
                  >
                    {isScreenSharing ? "Stop Share" : "Share Screen"}
                  </button>
                </>
              )}
            </div>

            <button
              onClick={leaveStream}
              className="px-4 py-1.5 bg-red-600 hover:bg-red-700 rounded text-sm font-semibold"
            >
              Leave Stream
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 w-full">
            {/* Video Streams Section */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              {isHost && (
                <div className="bg-slate-800 p-3 rounded-lg">
                  <h2 className="text-sm font-semibold mb-2 text-slate-300">Aapka Camera (Host Preview)</h2>
                  <video ref={localVideoRef} autoPlay playsInline muted className="w-full rounded bg-black aspect-video object-cover" />
                </div>
              )}

              <div className="bg-slate-800 p-3 rounded-lg">
                <h2 className="text-sm font-semibold mb-2 text-slate-300">Live Broadcast Feed</h2>
                <video ref={remoteVideoRef} autoPlay playsInline className="w-full rounded bg-black aspect-video object-cover" />
              </div>
            </div>

            {/* Live Chat Box Section */}
            <div className="bg-slate-800 rounded-lg p-4 flex flex-col h-[520px]">
              <h2 className="text-lg font-semibold border-b border-slate-700 pb-2 mb-3">Live Chat</h2>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {messages.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center mt-12">Abhi tak koi message nahi hai...</p>
                ) : (
                  messages.map((msg, index) => (
                    <div key={index} className="text-sm bg-slate-700/60 p-2 rounded break-words">
                      <span className="font-bold text-blue-400">{msg.sender}: </span>
                      <span>{msg.text}</span>
                    </div>
                  ))
                )}
                <div ref={chatBottomRef} />
              </div>

              <form onSubmit={sendMessage} className="mt-3 flex gap-2 border-t border-slate-700 pt-3">
                <input
                  type="text"
                  placeholder="Type a message..."
                  className="flex-1 bg-slate-700 px-3 py-2 rounded text-sm focus:outline-none focus:border-blue-500 border border-slate-600"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                />
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm font-semibold transition"
                >
                  Send
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {status && (
        <p className="mt-4 text-xs text-yellow-400 bg-slate-800 px-3 py-1.5 rounded">
          Status: {status}
        </p>
      )}
    </main>
  );
}