import React, { Component, useCallback, useEffect, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { StyleProp, ImageStyle } from 'react-native';

function makeFallback(name?: string): string {
  const n = name && name.trim() ? name.trim() : 'U';
  return 'https://ui-avatars.com/api/?name=' + encodeURIComponent(n) + '&size=200&background=4F46E5&color=fff&bold=true';
}

function toDisplayUri(uri: string | null | undefined): string | null {
  if (!uri || uri.trim() === '') return null;
  if (uri.startsWith('file://') || uri.startsWith('ph://')) return null;
  return uri;
}

interface SafeImageProps {
  uri: string | null | undefined;
  name?: string;
  style?: StyleProp<ImageStyle>;
  contentFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
}

type ImageErrorBoundaryProps = {
  fallbackUri: string;
  style?: StyleProp<ImageStyle>;
  contentFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  children: React.ReactNode;
};

class ImageErrorBoundary extends Component<
  ImageErrorBoundaryProps,
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError = () => ({ hasError: true });

  componentDidCatch() {
    // Swallow so the app doesn't show a red box; we render fallback instead.
  }

  render() {
    if (this.state.hasError) {
      return (
        <Image
          source={{ uri: this.props.fallbackUri }}
          style={this.props.style}
          contentFit={this.props.contentFit ?? 'cover'}
        />
      );
    }
    return this.props.children;
  }
}

/**
 * チカチカ防止: HEAD リクエストによる事前検証をやめ、uri を直接表示。
 * 失敗時のみ onError でフォールバックに切替（プレースホルダ→画像の切り替えを排除）
 */
export function SafeImage({ uri, name, style, contentFit = 'cover' }: SafeImageProps) {
  const fallback = useMemo(() => makeFallback(name), [name]);
  const displayUri = useMemo(() => toDisplayUri(uri) ?? fallback, [uri, fallback]);
  const [errorFallback, setErrorFallback] = useState<string | null>(null);

  useEffect(() => {
    setErrorFallback(null);
  }, [displayUri]);

  const handleError = useCallback(() => {
    setErrorFallback(displayUri === fallback ? null : fallback);
  }, [displayUri, fallback]);

  const src = errorFallback ?? displayUri;

  return (
    <ImageErrorBoundary fallbackUri={fallback} style={style} contentFit={contentFit}>
      <Image
        source={{ uri: src }}
        style={style}
        contentFit={contentFit}
        onError={handleError}
        cachePolicy="memory-disk"
      />
    </ImageErrorBoundary>
  );
}
