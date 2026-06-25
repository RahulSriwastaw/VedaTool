import React, { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";

interface Props {
  text: string;
  speed?: number;
  onComplete?: () => void;
}

const TypewriterText: React.FC<Props> = ({ text, speed = 10, onComplete }) => {
  const [displayedText, setDisplayedText] = useState("");
  const [index, setIndex] = useState(0);
  const textRef = useRef(text);

  useEffect(() => {
    // Reset if text changes significantly (e.g., new page)
    if (text !== textRef.current) {
      setDisplayedText("");
      setIndex(0);
      textRef.current = text;
    }
  }, [text]);

  useEffect(() => {
    if (index < text.length) {
      const timeoutId = setTimeout(() => {
        setDisplayedText((prev) => prev + text.charAt(index));
        setIndex((prev) => prev + 1);
      }, speed);
      return () => clearTimeout(timeoutId);
    } else if (index === text.length && text.length > 0) {
      onComplete?.();
    }
  }, [index, text, speed, onComplete]);

  return (
    <div className="whitespace-pre-wrap font-sans text-[#EFEFEF] leading-relaxed text-[15px]">
      {displayedText}
      {index < text.length && (
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity }}
          className="inline-block w-1 h-5 bg-[#FF6B2B] ml-1 align-middle"
        />
      )}
    </div>
  );
};

export default TypewriterText;
