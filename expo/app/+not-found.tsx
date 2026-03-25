import { Link, Stack, useRouter } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ThemeColors } from "@/constants/colors";
import { useTheme } from "@/providers/ThemeProvider";
import { useChess } from "@/providers/ChessProvider";
import { BackNavButton } from "@/components/BackNavButton";
import { t } from "@/utils/translations";

export default function NotFoundScreen() {
  const { colors } = useTheme();
  const { language } = useChess();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const title = t('page_not_found', language);
  const backLabel = t('back_to_home', language);

  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerLeft: () => <BackNavButton onPress={() => router.back()} />,
        }}
      />
      <View style={styles.container}>
        <Text style={styles.icon}>♟</Text>
        <Text style={styles.title}>{title}</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>{backLabel}</Text>
        </Link>
      </View>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
      backgroundColor: colors.background,
    },
    icon: {
      fontSize: 48,
      marginBottom: 16,
    },
    title: {
      fontSize: 18,
      fontWeight: "600" as const,
      color: colors.textPrimary,
    },
    link: {
      marginTop: 20,
      paddingVertical: 12,
      paddingHorizontal: 24,
      backgroundColor: colors.goldMuted,
      borderRadius: 10,
    },
    linkText: {
      fontSize: 14,
      color: colors.gold,
      fontWeight: "600" as const,
    },
  });
}
