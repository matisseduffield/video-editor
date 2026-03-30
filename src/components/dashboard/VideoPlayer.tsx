import { useState } from "react";
import { X } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { motion } from "framer-motion";

interface VideoPlayerProps {
  filePath: string;
  onClose: () => void;
}

export function VideoPlayer({ filePath, onClose }: VideoPlayerProps) {
  const [error, setError] = useState(false);
  const src = convertFileSrc(filePath);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="relative max-w-2xl w-full mx-4"
      >
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 p-1.5 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>
        {error ? (
          <div className="bg-card rounded-xl p-8 text-center text-muted-foreground text-sm">
            Failed to load video
          </div>
        ) : (
          <video
            src={src}
            controls
            autoPlay
            className="w-full rounded-xl shadow-2xl"
            onError={() => setError(true)}
          />
        )}
      </motion.div>
    </motion.div>
  );
}
