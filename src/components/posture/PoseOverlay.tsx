import { useEffect, useRef, useState, useCallback } from "react";
import { Maximize, Minimize } from "lucide-react";
import { Lang } from "@/lib/i18n";

// MoveNet keypoint connections for skeleton drawing
const SKELETON_CONNECTIONS: [number, number][] = [
  [0, 1], [0, 2], [1, 3], [2, 4], // head
  [5, 6], // shoulders
  [5, 7], [7, 9], // left arm
  [6, 8], [8, 10], // right arm
  [5, 11], [6, 12], // torso
  [11, 12], // hips
  [11, 13], [13, 15], // left leg
  [12, 14], [14, 16], // right leg
];

const KEYPOINT_COLORS: Record<number, string> = {
  0: "#ff4444",
  1: "#ff6644", 2: "#ff6644",
  3: "#ff8844", 4: "#ff8844",
  5: "#44bbff", 6: "#44bbff",
  7: "#44ddff", 8: "#44ddff",
  9: "#44ffdd", 10: "#44ffdd",
  11: "#44ff88", 12: "#44ff88",
  13: "#88ff44", 14: "#88ff44",
  15: "#ddff44", 16: "#ddff44",
};

interface Keypoint {
  x: number;
  y: number;
  score?: number;
  name?: string;
}

interface Props {
  videoUrl: string;
  lang: Lang;
}

const PoseOverlay = ({ videoUrl, lang }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const detectorRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const initDetector = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const tf = await import("@tensorflow/tfjs");
      await tf.ready();
      try {
        await tf.setBackend("webgl");
      } catch {
        await tf.setBackend("cpu");
      }
      const poseDetection = await import("@tensorflow-models/pose-detection");
      const detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
      );
      detectorRef.current = detector;
      setLoading(false);
    } catch (err) {
      console.error("Failed to load pose detector:", err);
      setError(lang === "zh" ? "無法載入姿勢偵測模型" : "Failed to load pose detection model");
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    initDetector();
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [initDetector]);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFSChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFSChange);
    document.addEventListener("webkitfullscreenchange", handleFSChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFSChange);
      document.removeEventListener("webkitfullscreenchange", handleFSChange);
    };
  }, []);

  const drawPose = useCallback((keypoints: Keypoint[], ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 3;
    for (const [i, j] of SKELETON_CONNECTIONS) {
      const kp1 = keypoints[i];
      const kp2 = keypoints[j];
      if ((kp1.score ?? 0) > 0.3 && (kp2.score ?? 0) > 0.3) {
        const gradient = ctx.createLinearGradient(kp1.x, kp1.y, kp2.x, kp2.y);
        gradient.addColorStop(0, KEYPOINT_COLORS[i] || "#44bbff");
        gradient.addColorStop(1, KEYPOINT_COLORS[j] || "#44bbff");
        ctx.strokeStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(kp1.x, kp1.y);
        ctx.lineTo(kp2.x, kp2.y);
        ctx.stroke();
      }
    }
    for (let i = 0; i < keypoints.length; i++) {
      const kp = keypoints[i];
      if ((kp.score ?? 0) > 0.3) {
        ctx.fillStyle = KEYPOINT_COLORS[i] || "#ffffff";
        ctx.beginPath();
        ctx.arc(kp.x, kp.y, 5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }, []);

  const detectPose = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const detector = detectorRef.current;

    if (!video || !canvas || !detector || video.paused || video.ended) {
      animFrameRef.current = requestAnimationFrame(detectPose);
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    try {
      const poses = await detector.estimatePoses(video);
      if (poses.length > 0) {
        drawPose(poses[0].keypoints, ctx, canvas.width, canvas.height);
      }
    } catch {
      // silently skip frame
    }

    animFrameRef.current = requestAnimationFrame(detectPose);
  }, [drawPose]);

  const handlePlay = useCallback(() => {
    if (detectorRef.current) {
      detectPose();
    }
  }, [detectPose]);

  const handlePause = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        } else if ((el as any).webkitRequestFullscreen) {
          await (el as any).webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        }
      }
    } catch {
      // ignore fullscreen errors
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative rounded-xl overflow-hidden bg-card border border-border ${isFullscreen ? "flex items-center justify-center bg-black" : ""}`}
    >
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        playsInline
        // @ts-ignore – webkit vendor attribute for iOS inline playback
        webkit-playsinline="true"
        x-webkit-airplay="deny"
        disablePictureInPicture
        controlsList="nofullscreen nodownload noremoteplayback"
        className={`${isFullscreen ? "w-full h-full object-contain" : "w-full max-h-56 object-contain bg-foreground/5"}`}
        crossOrigin="anonymous"
        onPlay={handlePlay}
        onPause={handlePause}
        onEnded={handlePause}
      />
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full pointer-events-none"
        style={{ objectFit: "contain" }}
      />
      {/* Custom fullscreen button */}
      <button
        onClick={toggleFullscreen}
        className="absolute bottom-2 right-2 z-10 bg-foreground/60 hover:bg-foreground/80 text-background rounded-md p-1.5 transition-colors"
        aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
      >
        {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
      </button>
      {loading && (
        <div className="absolute top-2 left-2 bg-foreground/70 text-background text-xs px-2 py-1 rounded-md flex items-center gap-1.5">
          <div className="w-3 h-3 border-2 border-background border-t-transparent rounded-full animate-spin" />
          {lang === "zh" ? "載入姿勢偵測..." : "Loading pose detection..."}
        </div>
      )}
      {error && (
        <div className="absolute top-2 left-2 bg-destructive/80 text-destructive-foreground text-xs px-2 py-1 rounded-md">
          {error}
        </div>
      )}
      {!loading && !error && (
        <div className="absolute top-2 right-2 bg-primary/80 text-primary-foreground text-xs px-2 py-1 rounded-md">
          🦴 MoveNet
        </div>
      )}
    </div>
  );
};

export default PoseOverlay;
