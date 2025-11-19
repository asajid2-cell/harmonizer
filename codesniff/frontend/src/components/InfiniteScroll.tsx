/**
 * Pinterest-style infinite scroll container
 */

import { useInView } from 'react-intersection-observer';
import { useEffect } from 'react';
import { motion } from 'framer-motion';

interface InfiniteScrollProps {
  children: React.ReactNode;
  hasMore?: boolean;
  onLoadMore?: () => void;
  isLoading?: boolean;
}

export const InfiniteScroll: React.FC<InfiniteScrollProps> = ({
  children,
  hasMore = false,
  onLoadMore,
  isLoading = false,
}) => {
  const { ref, inView } = useInView({
    threshold: 0,
    triggerOnce: false,
  });

  useEffect(() => {
    if (inView && hasMore && !isLoading && onLoadMore) {
      onLoadMore();
    }
  }, [inView, hasMore, isLoading, onLoadMore]);

  return (
    <div className="w-full">
      {/* Content */}
      <div className="space-y-6">
        {children}
      </div>

      {/* Load more trigger */}
      {hasMore && (
        <div ref={ref} className="py-8 flex justify-center">
          {isLoading && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="w-8 h-8 border-4 border-transparent border-t-primary-500 border-r-accent-500 rounded-full"
            />
          )}
        </div>
      )}
    </div>
  );
};

export default InfiniteScroll;
