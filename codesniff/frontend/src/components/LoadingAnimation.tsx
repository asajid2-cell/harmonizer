/**
 * TikTok-style loading animation
 */

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

interface LoadingAnimationProps {
  message?: string;
}

export const LoadingAnimation: React.FC<LoadingAnimationProps> = ({
  message = 'Searching codebase...',
}) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[100]"
    >
      <div className="text-center">
        {/* Animated gradient ring */}
        <div className="relative w-24 h-24 mx-auto mb-6">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'linear',
            }}
            className="absolute inset-0 border-4 border-transparent border-t-primary-500 border-r-accent-500 rounded-full"
          />
          <motion.div
            animate={{ rotate: -360 }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'linear',
            }}
            className="absolute inset-2 border-4 border-transparent border-b-secondary-500 border-l-primary-400 rounded-full"
          />

          {/* Center icon */}
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              animate={{
                scale: [1, 1.2, 1],
                rotate: [0, 180, 360],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            >
              <Sparkles className="w-8 h-8 text-primary-400" />
            </motion.div>
          </div>
        </div>

        {/* Loading text */}
        <motion.p
          animate={{
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="text-xl font-semibold bg-gradient-to-r from-primary-400 to-accent-500 bg-clip-text text-transparent"
        >
          {message}
        </motion.p>

        {/* Loading dots */}
        <div className="flex items-center justify-center gap-2 mt-4">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.5, 1, 0.5],
              }}
              transition={{
                duration: 1,
                repeat: Infinity,
                delay: i * 0.2,
                ease: 'easeInOut',
              }}
              className="w-2 h-2 bg-gradient-to-r from-primary-500 to-accent-500 rounded-full"
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
};

export default LoadingAnimation;
