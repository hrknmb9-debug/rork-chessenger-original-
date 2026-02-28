import React from 'react';
import { Image } from 'expo-image';
import { StyleProp, ImageStyle } from 'react-native';

interface SafeImageProps {
  uri: string | null | undefined;
  name?: string;
  style?: StyleProp<ImageStyle>;
  contentFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
}

// No fallback logic — raw URL is passed directly to test actual network behavior
export function SafeImage({ uri, name, style, contentFit = 'cover' }: SafeImageProps) {
  console.log('SafeImage uri:', uri);
  return (
    <Image
      source={{ uri: uri ?? undefined }}
      style={style}
      contentFit={contentFit}
      onError={(e) => console.log('SafeImage ERROR:', uri, e)}
    />
  );
}
