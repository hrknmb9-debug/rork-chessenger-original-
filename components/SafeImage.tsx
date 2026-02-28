import React, { useState, useEffect } from 'react';
import { Image } from 'expo-image';
import { StyleProp, ImageStyle } from 'react-native';

function makeFallback(name?: string): string {
  const n = name && name.trim() ? name.trim() : 'U';
  return 'https://ui-avatars.com/api/?name=' + encodeURIComponent(n) + '&size=200&background=4F46E5&color=fff&bold=true';
}

function toSrc(uri: string | null | undefined, fallback: string): string {
  if (!uri || uri.trim() === '') return fallback;
  return uri;
}

interface SafeImageProps {
  uri: string | null | undefined;
  name?: string;
  style?: StyleProp<ImageStyle>;
  contentFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
}

export function SafeImage({ uri, name, style, contentFit = 'cover' }: SafeImageProps) {
  const fallback = makeFallback(name);
  const [src, setSrc] = useState(() => toSrc(uri, fallback));

  useEffect(() => {
    setSrc(toSrc(uri, fallback));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  return (
    <Image
      source={{ uri: src }}
      style={style}
      contentFit={contentFit}
      onError={() => setSrc(fallback)}
    />
  );
}
