import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  Modal,
  FlatList,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Camera, MapPin, Clock, FileText, X, Check, Trophy, Flag, Globe, ChevronRight, Search } from 'lucide-react-native';
import { ThemeColors } from '@/constants/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useChess } from '@/providers/ChessProvider';
import { useAuth } from '@/providers/AuthProvider';
import { SkillLevel, PlayStyle } from '@/types';
import { t, COUNTRY_OPTIONS, LANGUAGE_OPTIONS, getCountryFlag, getCountryName, getLanguageFlag, getLanguageName } from '@/utils/translations';
import { supabaseNoAuth } from '@/utils/supabaseClient';

const SKILL_OPTIONS: SkillLevel[] = ['beginner', 'intermediate', 'advanced', 'expert'];
const TIME_OPTIONS = ['5+0', '10+0', '15+10', '30+0', '60+30'];
const PLAY_STYLE_OPTIONS: { key: PlayStyle; labelKey: string; emoji: string }[] = [
  { key: 'casual', labelKey: 'play_style_casual', emoji: '🎲' },
  { key: 'beginner_welcome', labelKey: 'play_style_beginner_welcome', emoji: '🌱' },
  { key: 'competitive', labelKey: 'play_style_competitive', emoji: '⚔️' },
  { key: 'spectator_welcome', labelKey: 'play_style_spectator_welcome', emoji: '👀' },
  { key: 'tournament', labelKey: 'play_style_tournament', emoji: '🏆' },
];

export default function EditProfileScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { profile, profileLoaded, updateProfile, language } = useChess();
  const router = useRouter();

  const [name, setName] = useState<string>('');
  const [bio, setBio] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [avatar, setAvatar] = useState<string>('');
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('beginner');
  const [timeControl, setTimeControl] = useState<string>('15+10');
  const [chessComRating, setChessComRating] = useState<string>('');
  const [lichessRating, setLichessRating] = useState<string>('');
  const [country, setCountry] = useState<string>('');
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [showCountryPicker, setShowCountryPicker] = useState<boolean>(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState<boolean>(false);
  const [selectedPlayStyles, setSelectedPlayStyles] = useState<PlayStyle[]>([]);
  const [countrySearch, setCountrySearch] = useState<string>('');
  const [languageSearch, setLanguageSearch] = useState<string>('');
  const [formInitialized, setFormInitialized] = useState<boolean>(false);

  useEffect(() => {
    if (profileLoaded && !formInitialized) {
      console.log('EditProfile: Initializing form with Supabase profile data', profile.name);
      setName(profile.name);
      setBio(profile.bio);
      setLocation(profile.location);
      setAvatar(profile.avatar);
      setSkillLevel(profile.skillLevel);
      setTimeControl(profile.preferredTimeControl);
      setChessComRating(profile.chessComRating !== null ? String(profile.chessComRating) : '');
      setLichessRating(profile.lichessRating !== null ? String(profile.lichessRating) : '');
      setCountry(profile.country ?? '');
      setSelectedLanguages(profile.languages);
      setSelectedPlayStyles(profile.playStyles ?? []);
      setFormInitialized(true);
    }
  }, [profileLoaded, formInitialized, profile]);

  const [isUploadingAvatar, setIsUploadingAvatar] = useState<boolean>(false);
  const { user } = useAuth();

  const uploadAvatarToSupabase = useCallback(async (uri: string): Promise<string | null> => {
    if (!user?.id || user.id === 'me') {
      console.log('Avatar upload: No valid user ID');
      return null;
    }

    try {
      setIsUploadingAvatar(true);
      console.log('Avatar upload: Starting for user', user.id, 'uri:', uri.slice(0, 60));

      const response = await fetch(uri);
      if (!response.ok) {
        console.log('Avatar upload: fetch failed', response.status);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        console.log('Avatar upload: Fetched image is empty (0 bytes)');
        return null;
      }

      // Always store as jpg/png to keep filePath predictable
      const fileExt = uri.toLowerCase().includes('.png') ? 'png' : 'jpg';
      const filePath = `${user.id}/avatar.${fileExt}`;
      const contentType = fileExt === 'png' ? 'image/png' : 'image/jpeg';

      const { error: uploadError } = await supabaseNoAuth.storage
        .from('avatars')
        .upload(filePath, arrayBuffer, {
          cacheControl: '3600',
          upsert: true,
          contentType,
        });

      if (uploadError) {
        console.log('Avatar upload: Storage error', uploadError.message);
        return null;
      }

      const { data: publicUrlData } = supabaseNoAuth.storage
        .from('avatars')
        .getPublicUrl(filePath);
      const cleanBaseUrl = (publicUrlData.publicUrl ?? '').trim();
      const publicUrl = cleanBaseUrl + '?t=' + Date.now();
      console.log('Avatar upload: Success, public URL:', publicUrl);

      const { error: upsertError } = await supabaseNoAuth
        .from('profiles')
        .upsert({ id: user.id, avatar_url: publicUrl });

      if (upsertError) {
        console.log('Avatar upload: Profile upsert error', upsertError.message);
      }

      return publicUrl;
    } catch (e) {
      console.log('Avatar upload: Exception', e);
      return null;
    } finally {
      setIsUploadingAvatar(false);
    }
  }, [user]);

  const handlePickAvatar = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        const localUri = result.assets[0].uri;
        // Show local preview immediately while uploading
        setAvatar(localUri);

        const storagePath = await uploadAvatarToSupabase(localUri);
        if (storagePath) {
          // Replace local preview with the server storage path
          setAvatar(storagePath);
          console.log('Avatar state set to storage path:', storagePath);
        } else {
          // Upload failed — revert to previous avatar, do not persist local path
          setAvatar(profile.avatar);
          Alert.alert('Upload failed', 'Could not upload avatar. Please try again.');
        }
      }
    } catch (e) {
      console.log('Image picker error:', e);
    }
  }, [uploadAvatarToSupabase, profile.avatar]);

  const { updateProfile: updateAuthProfile, reloadUser } = useAuth();

  const handleSave = useCallback(async () => {
    const parsedChessCom = chessComRating.trim() ? parseInt(chessComRating, 10) : null;
    const parsedLichess = lichessRating.trim() ? parseInt(lichessRating, 10) : null;
    const mainRating = parsedChessCom ?? parsedLichess ?? 0;

    const success = await updateProfile({
      name,
      bio,
      location,
      avatar,
      skillLevel,
      preferredTimeControl: timeControl,
      chessComRating: parsedChessCom !== null && !isNaN(parsedChessCom) ? parsedChessCom : null,
      lichessRating: parsedLichess !== null && !isNaN(parsedLichess) ? parsedLichess : null,
      rating: mainRating,
      country: country || undefined,
      languages: selectedLanguages,
      playStyles: selectedPlayStyles,
    });

    if (success) {
      try {
        await updateAuthProfile({ name, avatar });
      } catch (authErr) {
        console.log('EditProfile: updateAuthProfile failed (non-blocking)', authErr);
      }
      try {
        await reloadUser();
      } catch (reloadErr) {
        console.log('EditProfile: reloadUser failed (non-blocking)', reloadErr);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      console.log('EditProfile: Profile saved to Supabase and both providers synced');
      Alert.alert(t('profile_updated', language), '', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', 'Failed to save profile. Please try again.');
    }
  }, [name, bio, location, avatar, skillLevel, timeControl, chessComRating, lichessRating, country, selectedLanguages, selectedPlayStyles, updateProfile, updateAuthProfile, reloadUser, language, router]);

  const filteredCountries = useMemo(() => {
    if (!countrySearch.trim()) return [...COUNTRY_OPTIONS];
    const q = countrySearch.toLowerCase();
    return [...COUNTRY_OPTIONS].filter(c =>
      getCountryName(c, language).toLowerCase().includes(q) ||
      c.toLowerCase().includes(q)
    );
  }, [countrySearch, language]);

  const filteredLanguages = useMemo(() => {
    if (!languageSearch.trim()) return [...LANGUAGE_OPTIONS];
    const q = languageSearch.toLowerCase();
    return [...LANGUAGE_OPTIONS].filter(l =>
      getLanguageName(l).toLowerCase().includes(q) ||
      l.toLowerCase().includes(q)
    );
  }, [languageSearch]);

  const selectedLanguageDisplay = useMemo(() => {
    if (selectedLanguages.length === 0) return t('select_languages', language);
    return selectedLanguages.map(l => `${getLanguageFlag(l)} ${getLanguageName(l)}`).join(', ');
  }, [selectedLanguages, language]);

  const countryDisplay = useMemo(() => {
    if (!country) return t('select_country', language);
    return `${getCountryFlag(country)} ${getCountryName(country, language)}`;
  }, [country, language]);

  const renderCountryItem = useCallback(({ item }: { item: string }) => {
    const isSelected = country === item;
    return (
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          setCountry(isSelected ? '' : item);
          setShowCountryPicker(false);
          setCountrySearch('');
        }}
        style={[styles.pickerItem, isSelected && styles.pickerItemActive]}
      >
        <Text style={styles.pickerItemFlag}>{getCountryFlag(item)}</Text>
        <Text style={[styles.pickerItemText, isSelected && styles.pickerItemTextActive]}>
          {getCountryName(item, language)}
        </Text>
        {isSelected && <Check size={18} color={colors.gold} />}
      </Pressable>
    );
  }, [country, language, colors, styles]);

  const renderLanguageItem = useCallback(({ item }: { item: string }) => {
    const isSelected = selectedLanguages.includes(item);
    return (
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          setSelectedLanguages(prev =>
            isSelected ? prev.filter(l => l !== item) : [...prev, item]
          );
        }}
        style={[styles.pickerItem, isSelected && styles.pickerItemActive]}
      >
        <Text style={styles.pickerItemFlag}>{getLanguageFlag(item)}</Text>
        <Text style={[styles.pickerItemText, isSelected && styles.pickerItemTextActive]}>
          {getLanguageName(item)}
        </Text>
        {isSelected && <Check size={18} color={colors.gold} />}
      </Pressable>
    );
  }, [selectedLanguages, colors, styles]);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: t('edit_profile', language),
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={styles.headerBtn}>
              <X size={22} color={colors.textSecondary} />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={handleSave} style={styles.headerBtn}>
              <Check size={22} color={colors.gold} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={handlePickAvatar} style={styles.avatarSection} disabled={isUploadingAvatar}>
          <Image source={{ uri: avatar }} style={styles.avatar} contentFit="cover" />
          <View style={styles.cameraOverlay}>
            {isUploadingAvatar ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Camera size={18} color={colors.white} />
            )}
          </View>
          <Text style={styles.changePhotoText}>
            {isUploadingAvatar ? t('uploading', language) : t('change_photo', language)}
          </Text>
        </Pressable>

        <View style={styles.formGroup}>
          <Text style={styles.label}>{t('name', language)}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholderTextColor={colors.textMuted}
            testID="edit-name"
          />
        </View>

        <View style={styles.formGroup}>
          <View style={styles.labelRow}>
            <FileText size={14} color={colors.textMuted} />
            <Text style={styles.label}>{t('bio_label', language)}</Text>
          </View>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={bio}
            onChangeText={setBio}
            multiline
            numberOfLines={4}
            placeholderTextColor={colors.textMuted}
            testID="edit-bio"
          />
        </View>

        <View style={styles.formGroup}>
          <View style={styles.labelRow}>
            <MapPin size={14} color={colors.textMuted} />
            <Text style={styles.label}>{t('location_label', language)}</Text>
          </View>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholderTextColor={colors.textMuted}
            testID="edit-location"
          />
        </View>

        <View style={styles.formGroup}>
          <View style={styles.labelRow}>
            <Trophy size={14} color={colors.textMuted} />
            <Text style={styles.label}>{t('online_ratings', language)}</Text>
          </View>
          <View style={styles.ratingInputRow}>
            <View style={styles.ratingInputGroup}>
              <Text style={styles.ratingPlatformLabel}>Chess.com</Text>
              <View style={styles.ratingInputWrapper}>
                <TextInput
                  style={styles.ratingInput}
                  value={chessComRating}
                  onChangeText={(text) => setChessComRating(text.replace(/[^0-9]/g, ''))}
                  placeholder={t('no_experience', language)}
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={4}
                  testID="edit-chesscom-rating"
                />
                {chessComRating.length > 0 && (
                  <Pressable onPress={() => setChessComRating('')} style={styles.clearBtn}>
                    <X size={14} color={colors.textMuted} />
                  </Pressable>
                )}
              </View>
            </View>
            <View style={styles.ratingInputGroup}>
              <Text style={styles.ratingPlatformLabel}>Lichess</Text>
              <View style={styles.ratingInputWrapper}>
                <TextInput
                  style={styles.ratingInput}
                  value={lichessRating}
                  onChangeText={(text) => setLichessRating(text.replace(/[^0-9]/g, ''))}
                  placeholder={t('no_experience', language)}
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={4}
                  testID="edit-lichess-rating"
                />
                {lichessRating.length > 0 && (
                  <Pressable onPress={() => setLichessRating('')} style={styles.clearBtn}>
                    <X size={14} color={colors.textMuted} />
                  </Pressable>
                )}
              </View>
            </View>
          </View>
          {!chessComRating.trim() && !lichessRating.trim() && (
            <Text style={styles.ratingHint}>{t('no_experience', language)}</Text>
          )}
        </View>

        <View style={styles.formGroup}>
          <View style={styles.labelRow}>
            <Flag size={14} color={colors.textMuted} />
            <Text style={styles.label}>{t('country', language)}</Text>
          </View>
          <Pressable
            onPress={() => setShowCountryPicker(true)}
            style={styles.selectorButton}
            testID="country-selector"
          >
            <Text style={[styles.selectorText, !country && styles.selectorPlaceholder]}>
              {countryDisplay}
            </Text>
            <ChevronRight size={18} color={colors.textMuted} />
          </Pressable>
        </View>

        <View style={styles.formGroup}>
          <View style={styles.labelRow}>
            <Globe size={14} color={colors.textMuted} />
            <Text style={styles.label}>{t('spoken_languages', language)}</Text>
          </View>
          <Pressable
            onPress={() => setShowLanguagePicker(true)}
            style={styles.selectorButton}
            testID="language-selector"
          >
            <Text
              style={[
                styles.selectorText,
                selectedLanguages.length === 0 && styles.selectorPlaceholder,
              ]}
              numberOfLines={2}
            >
              {selectedLanguageDisplay}
            </Text>
            <ChevronRight size={18} color={colors.textMuted} />
          </Pressable>
          {selectedLanguages.length > 0 && (
            <View style={styles.selectedChipsRow}>
              {selectedLanguages.map(lang => (
                <View key={lang} style={styles.selectedChip}>
                  <Text style={styles.selectedChipFlag}>{getLanguageFlag(lang)}</Text>
                  <Text style={styles.selectedChipText}>{getLanguageName(lang)}</Text>
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedLanguages(prev => prev.filter(l => l !== lang));
                    }}
                    hitSlop={8}
                  >
                    <X size={14} color={colors.textMuted} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>{t('play_styles', language)}</Text>
          <View style={styles.optionsRow}>
            {PLAY_STYLE_OPTIONS.map(ps => {
              const isActive = selectedPlayStyles.includes(ps.key);
              return (
                <Pressable
                  key={ps.key}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedPlayStyles(prev =>
                      isActive ? prev.filter(s => s !== ps.key) : [...prev, ps.key]
                    );
                  }}
                  style={[
                    styles.optionChip,
                    isActive && styles.optionChipActive,
                  ]}
                >
                  <Text style={{ fontSize: 14 }}>{ps.emoji}</Text>
                  <Text
                    style={[
                      styles.optionText,
                      isActive && styles.optionTextActive,
                    ]}
                  >
                    {t(ps.labelKey, language)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>{t('skill_level', language)}</Text>
          <View style={styles.optionsRow}>
            {SKILL_OPTIONS.map(level => (
              <Pressable
                key={level}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSkillLevel(level);
                }}
                style={[
                  styles.optionChip,
                  skillLevel === level && styles.optionChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    skillLevel === level && styles.optionTextActive,
                  ]}
                >
                  {t(level, language)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.formGroup}>
          <View style={styles.labelRow}>
            <Clock size={14} color={colors.textMuted} />
            <Text style={styles.label}>{t('preferred_time_label', language)}</Text>
          </View>
          <View style={styles.optionsRow}>
            {TIME_OPTIONS.map(tc => (
              <Pressable
                key={tc}
                onPress={() => {
                  Haptics.selectionAsync();
                  setTimeControl(tc);
                }}
                style={[
                  styles.optionChip,
                  timeControl === tc && styles.optionChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    timeControl === tc && styles.optionTextActive,
                  ]}
                >
                  {tc}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable onPress={handleSave} style={styles.saveButton} testID="save-profile">
          <Text style={styles.saveText}>{t('save', language)}</Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={showCountryPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCountryPicker(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('select_country', language)}</Text>
            <Pressable onPress={() => { setShowCountryPicker(false); setCountrySearch(''); }} style={styles.modalCloseBtn}>
              <X size={22} color={colors.textSecondary} />
            </Pressable>
          </View>
          <View style={styles.modalSearchContainer}>
            <Search size={16} color={colors.textMuted} />
            <TextInput
              style={styles.modalSearchInput}
              placeholder={t('search_placeholder', language)}
              placeholderTextColor={colors.textMuted}
              value={countrySearch}
              onChangeText={setCountrySearch}
              autoFocus
            />
          </View>
          <FlatList
            data={filteredCountries}
            renderItem={renderCountryItem}
            keyExtractor={item => item}
            contentContainerStyle={styles.pickerList}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </Modal>

      <Modal
        visible={showLanguagePicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowLanguagePicker(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('select_languages', language)}</Text>
            <Pressable onPress={() => { setShowLanguagePicker(false); setLanguageSearch(''); }} style={styles.modalCloseBtn}>
              <Check size={22} color={colors.gold} />
            </Pressable>
          </View>
          <View style={styles.modalSearchContainer}>
            <Search size={16} color={colors.textMuted} />
            <TextInput
              style={styles.modalSearchInput}
              placeholder={t('search_placeholder', language)}
              placeholderTextColor={colors.textMuted}
              value={languageSearch}
              onChangeText={setLanguageSearch}
              autoFocus
            />
          </View>
          <FlatList
            data={filteredLanguages}
            renderItem={renderLanguageItem}
            keyExtractor={item => item}
            contentContainerStyle={styles.pickerList}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </Modal>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 60,
    },
    headerBtn: {
      padding: 6,
    },
    avatarSection: {
      alignItems: 'center',
      marginBottom: 32,
    },
    avatar: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: colors.surfaceLight,
      borderWidth: 3,
      borderColor: colors.gold,
    },
    cameraOverlay: {
      position: 'absolute',
      bottom: 24,
      right: '50%',
      marginRight: -52,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.gold,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.background,
    },
    changePhotoText: {
      fontSize: 13,
      color: colors.gold,
      fontWeight: '600' as const,
      marginTop: 8,
    },
    formGroup: {
      marginBottom: 22,
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 8,
    },
    label: {
      fontSize: 13,
      fontWeight: '600' as const,
      color: colors.textMuted,
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    input: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: colors.textPrimary,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    textArea: {
      minHeight: 80,
      textAlignVertical: 'top',
    },
    optionsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    optionChip: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    optionChipActive: {
      backgroundColor: colors.goldMuted,
      borderColor: colors.goldDark,
    },
    optionText: {
      fontSize: 14,
      fontWeight: '500' as const,
      color: colors.textSecondary,
    },
    optionTextActive: {
      color: colors.gold,
      fontWeight: '600' as const,
    },
    saveButton: {
      backgroundColor: colors.gold,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 12,
    },
    saveText: {
      fontSize: 17,
      fontWeight: '700' as const,
      color: colors.white,
    },
    ratingInputRow: {
      flexDirection: 'row' as const,
      gap: 12,
    },
    ratingInputGroup: {
      flex: 1,
    },
    ratingPlatformLabel: {
      fontSize: 12,
      fontWeight: '600' as const,
      color: colors.textSecondary,
      marginBottom: 6,
    },
    ratingInputWrapper: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    ratingInput: {
      flex: 1,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: colors.textPrimary,
    },
    clearBtn: {
      padding: 10,
    },
    ratingHint: {
      fontSize: 12,
      color: colors.orange,
      fontWeight: '500' as const,
      marginTop: 6,
    },
    selectorButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    selectorText: {
      fontSize: 15,
      color: colors.textPrimary,
      flex: 1,
      marginRight: 8,
    },
    selectorPlaceholder: {
      color: colors.textMuted,
    },
    selectedChipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 10,
    },
    selectedChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.goldMuted,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: colors.goldDark,
    },
    selectedChipFlag: {
      fontSize: 14,
    },
    selectedChipText: {
      fontSize: 13,
      fontWeight: '500' as const,
      color: colors.gold,
    },
    modalContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 12,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '700' as const,
      color: colors.textPrimary,
    },
    modalCloseBtn: {
      padding: 6,
    },
    modalSearchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 14,
      marginHorizontal: 20,
      marginBottom: 12,
      height: 42,
      gap: 10,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    modalSearchInput: {
      flex: 1,
      fontSize: 15,
      color: colors.textPrimary,
      height: '100%',
    },
    pickerList: {
      paddingHorizontal: 12,
      paddingBottom: 40,
    },
    pickerItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 12,
      marginVertical: 2,
      gap: 12,
    },
    pickerItemActive: {
      backgroundColor: colors.goldMuted,
    },
    pickerItemFlag: {
      fontSize: 22,
    },
    pickerItemText: {
      fontSize: 16,
      fontWeight: '500' as const,
      color: colors.textPrimary,
      flex: 1,
    },
    pickerItemTextActive: {
      color: colors.gold,
      fontWeight: '600' as const,
    },
  });
}
