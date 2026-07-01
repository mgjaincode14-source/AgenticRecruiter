import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  Camera,
  Mic,
  VideoOff,
  Play,
  ShieldAlert,
  Clock,
  ArrowRight,
  CheckCircle2,
  StopCircle,
  RefreshCw,
  Loader2,
} from "lucide-react";
import api from "../api";

const CandidateInterview = () => {
  const { candidateId } = useParams();

  // State management
  const [candidate, setCandidate] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [timerLimit, setTimerLimit] = useState(120);
  const [currentStep, setCurrentStep] = useState("checking");
  const [notAllowedMessage, setNotAllowedMessage] = useState("");
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(120);

  // Media streams
  const [mediaPermission, setMediaPermission] = useState("pending");
  const [micActivity, setMicActivity] = useState(0);

  // Recording & Transcript states
  const [responses, setResponses] = useState([]);
  const [currentAnswer, setCurrentAnswer] = useState(""); // browser draft (fallback)
  const [whisperAnswer, setWhisperAnswer] = useState(""); // Whisper-corrected answer (source of truth)
  const [isTranscribing, setIsTranscribing] = useState(false); // spinner while Whisper processes
  const [recordingState, setRecordingState] = useState("idle");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Refs — use refs for values that live inside callbacks
  const videoRef = useRef(null);
  const streamRef = useRef(null); // stable ref, avoids stale closure
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]); // full-session audio (for storage)
  const questionChunksRef = useRef([]); // per-question audio (for Whisper)
  const questionMediaRecorderRef = useRef(null); // separate recorder per question
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const speechRecognitionRef = useRef(null);
  const finalTranscriptRef = useRef("");
  const timerIntervalRef = useRef(null);
  const timerExpiredRef = useRef(false); // signals the interval to stop + auto-stop recording

  // 1. Initial Load & Eligibility Check
  useEffect(() => {
    const checkEligibility = async () => {
      try {
        // Fetch candidate details first
        const cRes = await api.get("/candidates");
        const cList = cRes.data.candidates || [];
        const currentCand = cList.find(
          (c) => String(c.id) === String(candidateId),
        );

        if (!currentCand) {
          setError(
            "Candidate details could not be found. Please check your invitation link.",
          );
          setCurrentStep("not-allowed");
          setNotAllowedMessage("Candidate not found.");
          return;
        }
        setCandidate(currentCand);

        // Check if candidate is allowed to take the interview (only once check)
        const checkRes = await api.get(
          `/candidate/${candidateId}/interview/check`,
        );
        if (!checkRes.data.allowed) {
          setCurrentStep("not-allowed");
          setNotAllowedMessage(
            checkRes.data.message ||
              "You are not allowed to take this interview.",
          );
          return;
        }

        // Fetch interview questions and timer limits
        const sRes = await api.get("/interview/settings");
        const questionsList = sRes.data.questions || [];
        setQuestions(questionsList);

        const limit = sRes.data.timer_limit || 120;
        setTimerLimit(limit);
        setTimeLeft(limit);

        // If eligible, move to setup screen
        setCurrentStep("setup");
      } catch (err) {
        console.error(err);
        setError("Error establishing connection with recruitment server.");
        setCurrentStep("not-allowed");
        setNotAllowedMessage(
          "Could not connect to the server. Please try again.",
        );
      }
    };
    checkEligibility();

    return () => {
      cleanupStreams();
      stopTimer();
    };
  }, [candidateId]);

  // Clean up media streams — uses streamRef so never stale
  const cleanupStreams = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.abort();
      } catch (e) {}
      speechRecognitionRef.current = null;
    }
  }, []);

  // Timer controls — avoid calling handleStopRecording inside setInterval (stale closure).
  // Instead, set a ref flag and let a useEffect react to it.
  const startTimer = (limit) => {
    stopTimer();
    timerExpiredRef.current = false;
    setTimeLeft(limit);
    timerIntervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerIntervalRef.current);
          timerExpiredRef.current = true; // effect below picks this up
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const stopTimer = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
  };

  // React to timer expiry via ref flag so we always have fresh handlers
  useEffect(() => {
    if (timeLeft === 0 && timerExpiredRef.current) {
      timerExpiredRef.current = false;
      handleStopRecording(true);
    }
  }, [timeLeft]);

  // 2. Request Media Permissions
  const requestPermissions = async () => {
    try {
      cleanupStreams();
      const userStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: true,
      });

      streamRef.current = userStream; // stable ref
      setMediaPermission("granted");

      if (videoRef.current) {
        videoRef.current.srcObject = userStream;
      }

      startAudioAnalyzer(userStream);
    } catch (err) {
      console.error("Permission denied:", err);
      setMediaPermission("denied");
      setError(
        "Camera and Microphone access are required to begin the virtual screening round.",
      );
    }
  };

  // Mic Volume Analyzer
  const startAudioAnalyzer = (mediaStream) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      const analyser = audioCtx.createAnalyser();
      const source = audioCtx.createMediaStreamSource(mediaStream);

      source.connect(analyser);
      analyser.fftSize = 256;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const checkVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        setMicActivity(Math.min(100, Math.round(average * 1.8)));
        animationFrameRef.current = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (e) {
      console.warn("Audio level visualizer failed:", e);
    }
  };

  // 3. Start Interview
  const startInterview = () => {
    setCurrentStep("interview");
    setCurrentQuestionIdx(0);
    recordedChunksRef.current = [];
    setRecordingState("idle");
    setTimeLeft(timerLimit);

    setTimeout(() => {
      if (videoRef.current && streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
    }, 100);
  };

  // Initialize MediaRecorder for questions is handled dynamically
  // ── Removed full-session recorder initialization ──


  // Action: Start Recording current question
  const handleStartRecording = () => {
    if (!streamRef.current) return;

    setRecordingState("recording");
    setError(null);
    setCurrentAnswer("");
    setWhisperAnswer("");

    // ── Full-session recorder removed ──

    // ── Per-question recorder for Whisper chunk ──
    questionChunksRef.current = [];
    try {
      let qRecorder;
      try {
        qRecorder = new MediaRecorder(streamRef.current, {
          mimeType: "audio/webm;codecs=opus",
        });
      } catch (e) {
        qRecorder = new MediaRecorder(streamRef.current);
      }
      qRecorder.ondataavailable = (evt) => {
        if (evt.data && evt.data.size > 0) {
          questionChunksRef.current.push(evt.data);
        }
      };
      qRecorder.start(1000);
      questionMediaRecorderRef.current = qRecorder;
    } catch (e) {
      console.error("Per-question MediaRecorder error:", e);
    }

    startTimer(timerLimit);
    finalTranscriptRef.current = ""; // Reset transcript for new question
    startSpeechRecognition();
  };

  // Start speech recognition transcribing
  const startSpeechRecognition = () => {
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch (e) {}
    }

    const SpeechRec =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      console.warn("SpeechRecognition API not supported.");
      return;
    }

    const rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (event) => {
      let interimTranscript = "";
      let newlyFinal = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          newlyFinal += event.results[i][0].transcript + " ";
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      finalTranscriptRef.current += newlyFinal;
      setCurrentAnswer(finalTranscriptRef.current + interimTranscript);
    };

    rec.onerror = (event) => {
      console.warn("[SpeechRec] Recognition error:", event.error);
    };

    rec.onend = () => {
      // Restart recognition with a slight delay if MediaRecorder is active to prevent immediate race conditions
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state === "recording"
      ) {
        setTimeout(() => {
          try {
            if (
              mediaRecorderRef.current &&
              mediaRecorderRef.current.state === "recording"
            ) {
              rec.start();
            }
          } catch (e) {
            console.warn("[SpeechRec] Failed to restart recognition:", e);
          }
        }, 150);
      }
    };

    speechRecognitionRef.current = rec;
    rec.start();
  };

  // Action: Stop Recording current question
  const handleStopRecording = (wasTimeout = false) => {
    setRecordingState("stopped");
    stopTimer();

    // ── Full-session recorder removed ──

    // Stop speech recognition
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.abort();
      } catch (e) {}
    }

    if (wasTimeout) {
      setError(
        "Time limit reached for this question! Your answer has been auto-saved.",
      );
    }

    // Stop per-question recorder and trigger Whisper
    const qRecorder = questionMediaRecorderRef.current;
    if (qRecorder && qRecorder.state !== "inactive") {
      qRecorder.onstop = async () => {
        const chunks = questionChunksRef.current;
        if (!chunks.length) return;
        const blob = new Blob(chunks, { type: "audio/webm" });
        if (blob.size < 100) return; // skip near-empty blobs
        setIsTranscribing(true);
        try {
          const formData = new FormData();
          formData.append("audio", blob, "chunk.webm");
          const res = await api.post("/interview/transcribe-chunk", formData, {
            headers: { "Content-Type": "multipart/form-data" },
          });
          const text = res.data?.transcript || "";
          if (text) {
            setWhisperAnswer(text);
          } else {
            // Fallback to browser draft if Whisper returns nothing
            setWhisperAnswer(currentAnswer || "[No spoken answer recorded]");
          }
        } catch (err) {
          console.error("[Whisper chunk] Error:", err);
          setWhisperAnswer(currentAnswer || "[No spoken answer recorded]");
        } finally {
          setIsTranscribing(false);
        }
      };
      try {
        qRecorder.stop();
      } catch (e) {}
    } else {
      // No per-question recorder active — use browser draft
      setWhisperAnswer(currentAnswer || "[No spoken answer recorded]");
    }
  };

  // Action: Rerecord the current question
  const handleRerecord = () => {
    setRecordingState("idle");
    setCurrentAnswer("");
    setWhisperAnswer("");
    setIsTranscribing(false);
    setTimeLeft(timerLimit);
    setError(null);
  };

  // Action: Save response and advance
  const handleSaveQuestion = () => {
    const currentQ =
      questions[currentQuestionIdx] ||
      `Screening Question #${currentQuestionIdx + 1}`;
    // Use the Whisper-corrected answer; fall back to browser draft if empty
    const cleanAnswer =
      (whisperAnswer || currentAnswer).trim() || "[No spoken answer recorded]";

    const newResponse = {
      question: currentQ,
      answer: cleanAnswer,
    };

    const updatedResponses = [...responses, newResponse];
    setResponses(updatedResponses);

    if (currentQuestionIdx >= questions.length - 1) {
      // Final question complete — stop recording cleanly and upload
      setRecordingState("idle");
      cleanupStreams();
      submitInterviewData(updatedResponses);
    } else {
      // Advance to next question in idle state
      setCurrentQuestionIdx((prev) => prev + 1);
      setRecordingState("idle");
      setCurrentAnswer("");
      setTimeLeft(timerLimit);
      setError(null);
    }
  };

  // 4. Submit Interview Data
  const submitInterviewData = async (finalResponses) => {
    setSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("transcript", JSON.stringify(finalResponses));

      await api.post(`/candidate/${candidateId}/interview/submit`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setCurrentStep("completed");
    } catch (err) {
      console.error(err);
      setError(
        err.response?.data?.detail ||
          "Failed to upload interview files. Please contact recruitment support.",
      );
      setCurrentStep("completed-error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen interview-bg flex flex-col items-center justify-center p-6 text-white">
      {/* Container Box */}
      <div
        className="w-full max-w-4xl rounded-2xl overflow-hidden animate-scale-in"
        style={{
          background: "#181818",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-6"
          style={{
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            background: "rgba(0,0,0,0.3)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#1DB954,#158a3e)" }}
            >
              <Camera className="w-5 h-5 text-black" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white tracking-tight">
                AgenticATS AI Screening
              </h2>
              <p className="text-xs mt-0.5" style={{ color: "#b3b3b3" }}>
                Automated Online Virtual Interview
              </p>
            </div>
          </div>
          {candidate && (
            <div className="text-right">
              <p className="text-sm font-bold text-white">{candidate.name}</p>
              <p className="text-xs" style={{ color: "#b3b3b3" }}>
                {candidate.email}
              </p>
            </div>
          )}
        </div>

        {/* Dynamic Step Layout */}
        <div className="p-8">
          {/* STEP 0: ELIGIBILITY CHECKING */}
          {currentStep === "checking" && (
            <div className="py-12 flex flex-col items-center justify-center space-y-4">
              <div className="w-10 h-10 rounded-full border-2 border-[#1DB954]/30 border-t-[#1DB954] animate-spin" />
              <p className="font-bold text-sm" style={{ color: "#b3b3b3" }}>
                Verifying candidate screening token...
              </p>
            </div>
          )}

          {/* STEP: NOT ELIGIBLE / ALREADY SUBMITTED */}
          {currentStep === "not-allowed" && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-6">
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center shadow-lg"
                style={{
                  background: "rgba(244,63,94,0.08)",
                  border: "1px solid rgba(244,63,94,0.25)",
                }}
              >
                <ShieldAlert
                  className="w-10 h-10"
                  style={{ color: "#f43f5e" }}
                />
              </div>
              <div className="space-y-2 max-w-md">
                <h3 className="text-2xl font-black text-white">
                  Access Restricted
                </h3>
                <p
                  className="text-sm leading-relaxed mt-2"
                  style={{ color: "#b3b3b3" }}
                >
                  {notAllowedMessage}
                </p>
              </div>
            </div>
          )}

          {/* STEP 1: SETUP SCREEN */}
          {currentStep === "setup" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div className="space-y-6">
                <div className="space-y-2">
                  <h3 className="text-2xl font-black text-white">
                    Virtual Interview Room Setup
                  </h3>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: "#b3b3b3" }}
                  >
                    Please test your devices. Turn{" "}
                    <span className="font-bold" style={{ color: "#1DB954" }}>
                      ON
                    </span>{" "}
                    your camera and mic. You will see questions on-screen and
                    speak your answers verbally.
                  </p>
                </div>

                <div className="space-y-4">
                  <div
                    className="flex items-center gap-3 p-4 rounded-xl"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ background: "rgba(29,185,84,0.10)" }}
                    >
                      <Camera
                        className="w-5 h-5"
                        style={{ color: "#1DB954" }}
                      />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        Video Feed (Camera)
                      </h4>
                      <p
                        className="text-xs mt-0.5"
                        style={{ color: "#535353" }}
                      >
                        Displays candidate camera stream.
                      </p>
                    </div>
                    <span
                      className={`ml-auto text-xs font-bold px-3 py-1 rounded-full ${
                        mediaPermission === "granted"
                          ? "bg-[#1DB954]/10 text-[#1DB954] border border-[#1DB954]/30"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                      }`}
                    >
                      {mediaPermission === "granted" ? "Camera ON" : "Ready"}
                    </span>
                  </div>

                  <div
                    className="flex items-center gap-3 p-4 rounded-xl"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ background: "rgba(29,185,84,0.10)" }}
                    >
                      <Mic className="w-5 h-5" style={{ color: "#1DB954" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-white">
                        Voice Feed (Microphone)
                      </h4>
                      <p
                        className="text-xs mt-0.5"
                        style={{ color: "#535353" }}
                      >
                        Captures spoken verbal response.
                      </p>

                      {mediaPermission === "granted" && (
                        <div
                          className="w-full rounded-full mt-2.5 overflow-hidden h-1.5"
                          style={{ background: "rgba(255,255,255,0.08)" }}
                        >
                          <div
                            className="sp-progress-fill h-full"
                            style={{ width: `${micActivity}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <span
                      className={`text-xs font-bold px-3 py-1 rounded-full ${
                        mediaPermission === "granted"
                          ? "bg-[#1DB954]/10 text-[#1DB954] border border-[#1DB954]/30"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                      }`}
                    >
                      {mediaPermission === "granted" ? "Mic ON" : "Ready"}
                    </span>
                  </div>
                </div>

                {mediaPermission !== "granted" ? (
                  <button
                    onClick={requestPermissions}
                    className="w-full py-4 sp-btn flex items-center justify-center gap-2"
                  >
                    <Camera className="w-5 h-5" /> Enable Camera & Mic
                  </button>
                ) : (
                  <button
                    onClick={startInterview}
                    disabled={questions.length === 0}
                    className="w-full py-4 sp-btn flex items-center justify-center gap-2 group disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-none"
                  >
                    Start AI Screening Room{" "}
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </button>
                )}
              </div>

              {/* Video Preview Box */}
              <div className="flex flex-col items-center justify-center">
                <div
                  className="w-full aspect-video rounded-2xl overflow-hidden relative shadow-inner"
                  style={{
                    background: "#000",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  {mediaPermission === "granted" ? (
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover mirror-mode"
                    />
                  ) : (
                    <div
                      className="absolute inset-0 flex flex-col items-center justify-center"
                      style={{ color: "#535353" }}
                    >
                      <VideoOff className="w-12 h-12 mb-3" />
                      <p className="text-xs font-medium uppercase tracking-widest">
                        Feed Not Available
                      </p>
                    </div>
                  )}
                  {mediaPermission === "granted" && (
                    <div
                      className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-md"
                      style={{
                        background: "rgba(0,0,0,0.7)",
                        border: "1px solid rgba(255,255,255,0.1)",
                      }}
                    >
                      <span className="w-2.5 h-2.5 rounded-full bg-[#1DB954] animate-pulse"></span>
                      <span
                        className="text-[10px] font-black uppercase"
                        style={{ color: "#b3b3b3" }}
                      >
                        Live Camera Check
                      </span>
                    </div>
                  )}
                </div>
                {error && (
                  <div
                    className="mt-4 p-4 rounded-xl text-xs font-semibold flex items-start gap-2.5 w-full"
                    style={{
                      background: "rgba(244,63,94,0.08)",
                      border: "1px solid rgba(244,63,94,0.2)",
                      color: "#fda4af",
                    }}
                  >
                    <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: ACTIVE INTERVIEW SCREEN */}
          {currentStep === "interview" && questions.length > 0 && (
            <div className="space-y-6">
              {/* Question Tracker & Global Timer display */}
              <div
                className="flex justify-between items-center p-4 rounded-xl"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div>
                  <span
                    className="text-xs font-bold uppercase tracking-widest"
                    style={{ color: "#1DB954" }}
                  >
                    Screening Phase
                  </span>
                  <h4 className="text-base font-black text-white mt-0.5">
                    Question {currentQuestionIdx + 1} of {questions.length}
                  </h4>
                </div>
                <div
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-lg font-black ${
                    recordingState === "recording" && timeLeft <= 15
                      ? "bg-rose-950/30 border border-rose-500/30 text-rose-400 animate-pulse"
                      : "text-white"
                  }`}
                  style={{
                    background:
                      recordingState === "recording" && timeLeft <= 15
                        ? undefined
                        : "rgba(0,0,0,0.4)",
                    border:
                      recordingState === "recording" && timeLeft <= 15
                        ? undefined
                        : "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <Clock
                    className={`w-4 h-4 ${recordingState === "recording" && timeLeft <= 15 ? "text-rose-400" : "text-[#1DB954]"}`}
                  />
                  <span>
                    {Math.floor(timeLeft / 60)}:
                    {(timeLeft % 60).toString().padStart(2, "0")}
                  </span>
                </div>
              </div>

              {/* Main Content splits */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Text / Transcript Column */}
                <div className="md:col-span-2 space-y-6 flex flex-col justify-between">
                  {/* Current Question Box */}
                  <div
                    className="p-6 rounded-2xl min-h-[160px] flex items-center"
                    style={{
                      background: "rgba(29,185,84,0.04)",
                      border: "1px solid rgba(29,185,84,0.12)",
                    }}
                  >
                    <h3 className="text-xl font-black text-white leading-relaxed">
                      {questions[currentQuestionIdx]}
                    </h3>
                  </div>

                  {/* Whisper AI Transcript Preview */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label
                        className="text-[10px] font-black uppercase tracking-widest"
                        style={{ color: "#535353" }}
                      >
                        {isTranscribing
                          ? "AI Transcribing..."
                          : recordingState === "stopped" && whisperAnswer
                            ? "AI-Corrected Transcript"
                            : "Live Transcript Preview"}
                      </label>
                      {recordingState === "recording" && (
                        <span
                          className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest flex items-center gap-1"
                          style={{
                            background: "rgba(244,63,94,0.10)",
                            border: "1px solid rgba(244,63,94,0.25)",
                            color: "#f87171",
                          }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping inline-block" />
                          Recording
                        </span>
                      )}
                      {isTranscribing && (
                        <span
                          className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest flex items-center gap-1"
                          style={{
                            background: "rgba(29,185,84,0.10)",
                            border: "1px solid rgba(29,185,84,0.25)",
                            color: "#1DB954",
                          }}
                        >
                          <div className="w-2.5 h-2.5 rounded-full border border-[#1DB954]/30 border-t-[#1DB954] animate-spin" />{" "}
                          Whisper AI Processing
                        </span>
                      )}
                      {recordingState === "stopped" &&
                        !isTranscribing &&
                        whisperAnswer && (
                          <span
                            className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest"
                            style={{
                              background: "rgba(29,185,84,0.10)",
                              border: "1px solid rgba(29,185,84,0.25)",
                              color: "#1DB954",
                            }}
                          >
                            ✓ AI Corrected
                          </span>
                        )}
                    </div>

                    <div
                      className={`w-full min-h-32 rounded-2xl p-4 text-sm font-medium leading-relaxed transition-all ${
                        isTranscribing
                          ? ""
                          : recordingState === "recording"
                            ? ""
                            : recordingState === "stopped" && whisperAnswer
                              ? ""
                              : ""
                      }`}
                      style={{
                        background: isTranscribing
                          ? "rgba(29,185,84,0.04)"
                          : recordingState === "recording"
                            ? "rgba(244,63,94,0.04)"
                            : recordingState === "stopped" && whisperAnswer
                              ? "rgba(29,185,84,0.05)"
                              : "rgba(255,255,255,0.03)",
                        border: isTranscribing
                          ? "1px solid rgba(29,185,84,0.15)"
                          : recordingState === "recording"
                            ? "1px solid rgba(244,63,94,0.20)"
                            : recordingState === "stopped" && whisperAnswer
                              ? "1px solid rgba(29,185,84,0.20)"
                              : "1px solid rgba(255,255,255,0.06)",
                        color: isTranscribing
                          ? "#535353"
                          : recordingState === "recording"
                            ? "#e2e8f0"
                            : "#ffffff",
                      }}
                    >
                      {recordingState === "idle" && (
                        <span
                          className="block text-center pt-6 text-xs font-bold"
                          style={{ color: "#535353" }}
                        >
                          Click "Start Recording" below and speak your answer.
                        </span>
                      )}
                      {recordingState === "recording" && (
                        <span>
                          {currentAnswer ||
                            "Listening... Speak clearly into the microphone."}
                        </span>
                      )}
                      {isTranscribing && (
                        <div className="flex flex-col items-center justify-center py-4 gap-3">
                          <div className="w-6 h-6 rounded-full border-2 border-[#1DB954]/30 border-t-[#1DB954] animate-spin" />
                          <p
                            className="text-xs font-bold text-center"
                            style={{ color: "#1DB954" }}
                          >
                            Groq Whisper AI is transcribing your answer...
                            <br />
                            <span
                              style={{ color: "#535353", fontWeight: "normal" }}
                            >
                              Technical terms will be corrected automatically.
                            </span>
                          </p>
                        </div>
                      )}
                      {recordingState === "stopped" && !isTranscribing && (
                        <span className="whitespace-pre-wrap">
                          {whisperAnswer || "[No spoken answer recorded]"}
                        </span>
                      )}
                    </div>

                    {/* Read-only notice — no editing allowed */}
                    {recordingState === "stopped" && !isTranscribing && (
                      <p
                        className="text-[10px] font-medium"
                        style={{ color: "#535353" }}
                      >
                        This transcript was generated by Groq Whisper AI from
                        your audio recording and is read-only. If it is
                        incorrect, click{" "}
                        <span style={{ color: "#f59e0b" }}>Retry</span> to
                        re-record.
                      </p>
                    )}
                  </div>
                </div>

                {/* Camera preview and Actions Column */}
                <div className="flex flex-col gap-4">
                  {/* Video Box */}
                  <div
                    className="aspect-video md:aspect-square rounded-2xl overflow-hidden relative shadow-md"
                    style={{
                      background: "#000",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover mirror-mode"
                    />

                    {recordingState === "recording" && (
                      <div
                        className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full shadow-md"
                        style={{
                          background: "rgba(220,38,38,0.85)",
                          border: "1px solid rgba(255,255,255,0.1)",
                        }}
                      >
                        <span className="relative flex h-2 w-2">
                          <span className="sp-record-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                        </span>
                        <span className="text-[8px] font-black uppercase text-white tracking-widest">
                          REC
                        </span>
                      </div>
                    )}

                    {recordingState === "stopped" && !isTranscribing && (
                      <div
                        className="absolute top-3 right-3 px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-md"
                        style={{
                          background: "rgba(0,0,0,0.7)",
                          border: "1px solid rgba(29,185,84,0.3)",
                        }}
                      >
                        <span
                          className="text-[8px] font-black uppercase tracking-widest"
                          style={{ color: "#1DB954" }}
                        >
                          ✓ DONE
                        </span>
                      </div>
                    )}
                    {isTranscribing && (
                      <div
                        className="absolute top-3 right-3 px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-md animate-pulse"
                        style={{
                          background: "rgba(29,185,84,0.15)",
                          border: "1px solid rgba(29,185,84,0.3)",
                        }}
                      >
                        <div className="w-2.5 h-2.5 rounded-full border border-[#1DB954]/30 border-t-[#1DB954] animate-spin" />
                        <span
                          className="text-[8px] font-black uppercase tracking-widest"
                          style={{ color: "#1DB954" }}
                        >
                          AI
                        </span>
                      </div>
                    )}

                    {/* Microphone meter overlay */}
                    <div
                      className="absolute bottom-3 left-3 right-3 p-2 rounded-xl flex items-center gap-2"
                      style={{
                        background: "rgba(0,0,0,0.7)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <Mic
                        className="w-3.5 h-3.5 flex-shrink-0"
                        style={{ color: "#1DB954" }}
                      />
                      <div
                        className="flex-1 h-1 rounded-full overflow-hidden"
                        style={{ background: "rgba(255,255,255,0.1)" }}
                      >
                        <div
                          className="sp-progress-fill h-full"
                          style={{ width: `${micActivity}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Actions buttons based on state */}
                  <div className="space-y-3">
                    {recordingState === "idle" && (
                      <button
                        onClick={handleStartRecording}
                        className="w-full py-4 sp-btn flex items-center justify-center gap-2"
                      >
                        <Play className="w-4 h-4 fill-black" /> Start Recording
                      </button>
                    )}

                    {recordingState === "recording" && (
                      <button
                        onClick={() => handleStopRecording(false)}
                        className="w-full py-4 rounded-full text-white font-black text-sm flex items-center justify-center gap-2 transition-all"
                        style={{
                          background: "#dc2626",
                          boxShadow: "0 0 20px rgba(220,38,38,0.35)",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = "#b91c1c")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "#dc2626")
                        }
                      >
                        <StopCircle className="w-4 h-4" /> Stop Recording
                      </button>
                    )}

                    {recordingState === "stopped" && (
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={handleRerecord}
                          disabled={isTranscribing}
                          className="col-span-1 py-4 rounded-full text-xs font-bold transition-all flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{
                            background: "rgba(255,255,255,0.07)",
                            color: "#b3b3b3",
                            border: "1px solid rgba(255,255,255,0.10)",
                          }}
                          onMouseEnter={(e) => {
                            if (!isTranscribing) {
                              e.currentTarget.style.background =
                                "rgba(255,255,255,0.12)";
                              e.currentTarget.style.color = "#fff";
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background =
                              "rgba(255,255,255,0.07)";
                            e.currentTarget.style.color = "#b3b3b3";
                          }}
                          title="Rerecord Answer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Retry
                        </button>
                        <button
                          onClick={handleSaveQuestion}
                          disabled={isTranscribing}
                          className="col-span-2 py-4 sp-btn text-xs flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {isTranscribing ? (
                            <>
                              <div className="w-3.5 h-3.5 rounded-full border border-black/30 border-t-black animate-spin" />{" "}
                              AI Transcribing...
                            </>
                          ) : (
                            <>
                              {currentQuestionIdx >= questions.length - 1
                                ? "Submit & Complete"
                                : "Save & Next"}
                              <ArrowRight className="w-3.5 h-3.5" />
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {error && (
                <div
                  className="p-4 rounded-xl text-xs font-semibold flex items-start gap-2.5"
                  style={{
                    background: "rgba(245,158,11,0.08)",
                    border: "1px solid rgba(245,158,11,0.20)",
                    color: "#fcd34d",
                  }}
                >
                  <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: SUBMITTING DATA SCREEN */}
          {submitting && (
            <div className="py-12 flex flex-col items-center justify-center space-y-4">
              <div className="w-12 h-12 rounded-full border-2 border-[#1DB954]/30 border-t-[#1DB954] animate-spin" />
              <h3 className="text-xl font-bold text-white">
                Saving Screening Data...
              </h3>
              <p className="text-sm text-center" style={{ color: "#b3b3b3" }}>
                Uploading your verbal response recording file and transcripts to
                your candidate profile.
              </p>
            </div>
          )}

          {/* STEP 4: SUCCESS / COMPLETE SCREEN */}
          {currentStep === "completed" && !submitting && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-6">
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center shadow-lg sp-pulse"
                style={{
                  background: "rgba(29,185,84,0.10)",
                  border: "2px solid rgba(29,185,84,0.35)",
                }}
              >
                <CheckCircle2
                  className="w-10 h-10"
                  style={{ color: "#1DB954" }}
                />
              </div>
              <div className="space-y-2 max-w-md">
                <h3 className="text-3xl font-black text-white">
                  Interview Complete!
                </h3>
                <p
                  className="text-sm leading-relaxed mt-2"
                  style={{ color: "#b3b3b3" }}
                >
                  Thank you for completing the online screening round. Your
                  answers and audio recording have been successfully stored in
                  our database.
                </p>
                <div
                  className="p-4 rounded-xl mt-6 text-xs leading-relaxed"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    color: "#535353",
                  }}
                >
                  Our AI hiring agent will now perform an automated evaluation
                  of your spoken answers. A score will be calculated and
                  reported to HR. You may now safely close this window.
                </div>
              </div>
            </div>
          )}

          {/* STEP: UPLOAD ERROR SCREEN */}
          {currentStep === "completed-error" && !submitting && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-6">
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center shadow-lg"
                style={{
                  background: "rgba(244,63,94,0.08)",
                  border: "1px solid rgba(244,63,94,0.25)",
                }}
              >
                <ShieldAlert
                  className="w-10 h-10"
                  style={{ color: "#f43f5e" }}
                />
              </div>
              <div className="space-y-2 max-w-md">
                <h3 className="text-2xl font-black text-white">Upload Error</h3>
                <p
                  className="text-sm leading-relaxed mt-2"
                  style={{ color: "#b3b3b3" }}
                >
                  {error}
                </p>
                <button
                  onClick={() => submitInterviewData(responses)}
                  className="px-6 py-2.5 sp-btn text-xs mt-4"
                >
                  Retry Upload
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CandidateInterview;
