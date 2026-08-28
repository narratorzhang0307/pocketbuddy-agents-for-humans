import {
  useEffect,
  useRef,
  useState,
  type ImgHTMLAttributes,
} from 'react';

type ProgressiveImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string;
  previewSrc: string;
  eager?: boolean;
};

/**
 * Paints a small local preview first, then swaps to the full asset after it has
 * decoded. Off-screen instances do not start the full request until they near
 * the viewport. The browser cache makes a later detail view reuse that file.
 */
export default function ProgressiveImage({
  src,
  previewSrc,
  eager = false,
  onError,
  ...imageProps
}: ProgressiveImageProps) {
  const elementRef = useRef<HTMLImageElement | null>(null);
  const [currentSrc, setCurrentSrc] = useState(previewSrc);

  useEffect(() => {
    setCurrentSrc(previewSrc);
    let cancelled = false;
    let observer: IntersectionObserver | null = null;

    const loadFullImage = () => {
      const fullImage = new Image();
      fullImage.decoding = 'async';
      fullImage.onload = () => {
        if (!cancelled) setCurrentSrc(src);
      };
      fullImage.src = src;
    };

    if (eager || typeof IntersectionObserver === 'undefined') {
      loadFullImage();
    } else if (elementRef.current) {
      observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          observer?.disconnect();
          loadFullImage();
        },
        { rootMargin: '240px' },
      );
      observer.observe(elementRef.current);
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [eager, previewSrc, src]);

  return (
    <img
      {...imageProps}
      ref={elementRef}
      src={currentSrc}
      decoding="async"
      loading={eager ? 'eager' : 'lazy'}
      onError={(event) => {
        if (currentSrc !== src) setCurrentSrc(src);
        onError?.(event);
      }}
    />
  );
}
