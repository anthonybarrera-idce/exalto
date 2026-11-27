import Constants from 'expo-constants';
import { Check, ChevronRight, Globe, Headphones, Info, ListMusic, LogOut, Music2, Trash2, UserRound } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BecomeComposerPage, ComposerProfilePage, MyHymnsPage } from '@/components/account/ComposerPages';
import { DeleteAccountPage } from '@/components/account/DeleteAccountPage';
import { HymnalEditorPage } from '@/components/editor/HymnalEditorPage';
import { HymnEditorPage } from '@/components/editor/HymnEditorPage';
import { ProfileEditPage } from '@/components/account/ProfileEditPage';
import { EmailPage, WelcomePage } from '@/components/account/SignInPages';
import { AccountColors, accountStyles, Avatar, Message, PageHeader } from '@/components/account/ui';
import { ThemedText } from '@/components/themed-text';
import { PageStack } from '@/components/ui/transitions';
import { Palette, Spacing } from '@/constants/theme';
import { type AccountPage, useAuth } from '@/context/auth-context';
import { type LanguagePreference, useLocale } from '@/context/locale-context';
import type { StringKey } from '@/i18n/strings';
import { authErrorKey } from '@/lib/auth/errors';
import { watchComposerRequest, type ComposerRequest } from '@/lib/composers';
import { useAutoPlay } from '@/lib/playback-settings';

/** One sheet for settings and everything account-related; pages swap inside it (no stacked modals). */
export function AccountSheet() {
  const { sheetPage, openAccount, closeAccount, needsSetup, user, profile, composerUid, editTarget } = useAuth();
  // Editors go back where they were opened from (Manage hymns), or close when opened from the Hymns tab.
  const editorBack = () => (editTarget?.returnTo ? openAccount(editTarget.returnTo) : closeAccount());
  const insets = useSafeAreaInsets();
  // While the sheet slides down `sheetPage` is already null: keep showing the last page instead of jumping to Settings.
  const [held, setHeld] = useState<AccountPage>('settings');
  if (sheetPage && sheetPage !== held) setHeld(sheetPage);
  const page = sheetPage ?? held;
  const toSettings = () => openAccount('settings');

  // Once a sign-in lands and the profile has loaded: new accounts set up their profile, others see settings.
  const signedIn = Boolean(user && profile);
  useEffect(() => {
    if (signedIn && (sheetPage === 'welcome' || sheetPage === 'email')) openAccount(needsSetup ? 'edit' : 'settings');
  }, [signedIn, sheetPage, needsSetup, openAccount]);

  function renderPage(p: AccountPage) {
    switch (p) {
      case 'settings':
        return <SettingsPage />;
      case 'welcome':
        return <WelcomePage onBack={toSettings} onEmail={() => openAccount('email')} onGuest={closeAccount} />;
      case 'email':
        return <EmailPage onBack={() => openAccount('welcome')} />;
      case 'edit':
        return <ProfileEditPage onBack={toSettings} onDone={toSettings} />;
      case 'delete':
        return <DeleteAccountPage onBack={toSettings} onDeleted={toSettings} />;
      case 'composer':
        // Your own page opens from Settings; someone else's opens from a hymnal, so Back closes the sheet.
        return composerUid ? <ComposerProfilePage uid={composerUid} onBack={composerUid === user?.uid ? toSettings : closeAccount} /> : null;
      case 'myHymns':
        return <MyHymnsPage onBack={toSettings} />;
      case 'becomeComposer':
        return <BecomeComposerPage onBack={toSettings} />;
      case 'hymnEditor':
        return editTarget?.kind === 'hymn' ? (
          <HymnEditorPage key={editTarget.id ?? `new-${editTarget.hymnalId}`} id={editTarget.id} hymnalId={editTarget.hymnalId} onBack={editorBack} />
        ) : null;
      case 'hymnalEditor':
        return editTarget?.kind === 'hymnal' ? <HymnalEditorPage key={editTarget.id ?? 'new'} id={editTarget.id} onBack={editorBack} /> : null;
      default:
        return null;
    }
  }

  return (
    <Modal
      visible={sheetPage !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={closeAccount}>
      {/* Pages slide like a navigation stack: deeper pages in from the right, Back out to the right. */}
      <PageStack page={page} depthOf={pageDepth} renderPage={renderPage} style={styles.root} pageStyle={[styles.root, { paddingBottom: insets.bottom }]} />
    </Modal>
  );
}

/** How deep each page sits below Settings, for the slide direction. */
const PAGE_DEPTH: Record<AccountPage, number> = {
  settings: 0,
  welcome: 1,
  edit: 1,
  delete: 1,
  composer: 1,
  myHymns: 1,
  becomeComposer: 1,
  email: 2,
  hymnEditor: 2,
  hymnalEditor: 2,
};
function pageDepth(page: AccountPage, from: AccountPage) {
  // Finishing sign-in moves on to profile setup, even though Setup sits shallower than the email page.
  if (page === 'edit' && (from === 'welcome' || from === 'email')) return 3;
  return PAGE_DEPTH[page] ?? 1;
}

const LANGUAGES: { value: LanguagePreference; label: string }[] = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
];

/** Figma "Settings": the account card on top, then language and about. */
function SettingsPage() {
  const { t, preference, setPreference } = useLocale();
  const [autoPlay, setAutoPlay] = useAutoPlay();
  const { user, profile, openAccount, closeAccount, signOut, isComposer, canEditAll, openComposer, displayRole } = useAuth();
  const [request, setRequest] = useState<ComposerRequest | null>(null);
  const uid = user?.uid;
  useEffect(() => {
    setRequest(null);
    if (!uid || isComposer) return;
    return watchComposerRequest(uid, setRequest);
  }, [uid, isComposer]);
  const version = Constants.expoConfig?.version ?? '';
  const [error, setError] = useState<string | null>(null);
  const name = profile?.displayName || user?.displayName || user?.email || '';
  const role = t(`role.${displayRole}` as StringKey);

  async function doSignOut() {
    setError(null);
    try {
      await signOut();
    } catch (e) {
      setError(t(authErrorKey(e)));
    }
  }

  return (
    <>
      <PageHeader
        title={t('settings.title')}
        right={
          <Pressable onPress={closeAccount} hitSlop={10} accessibilityRole="button">
            <ThemedText style={styles.done}>{t('settings.done')}</ThemedText>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        {user ? (
          <View style={[accountStyles.card, styles.accountCard]}>
            <Avatar name={name} photoURL={profile?.photoURL ?? user.photoURL} size={44} />
            <View style={styles.flex}>
              <ThemedText style={styles.name} numberOfLines={1}>
                {name}
              </ThemedText>
              <ThemedText style={styles.meta} numberOfLines={1}>
                {profile?.handle ? `@${profile.handle} · ${role}` : role}
              </ThemedText>
              {user.email ? (
                <ThemedText style={styles.meta} numberOfLines={1}>
                  {user.email}
                </ThemedText>
              ) : null}
            </View>
            <Pressable onPress={() => openAccount('edit')} style={styles.chip} accessibilityRole="button">
              <ThemedText style={styles.chipText}>{t('account.edit')}</ThemedText>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => openAccount('welcome')} style={[accountStyles.card, styles.accountCard]} accessibilityRole="button">
            <View style={styles.guestAvatar}>
              <UserRound size={22} color={Palette.amber} />
            </View>
            <View style={styles.flex}>
              <ThemedText style={styles.name}>{t('account.signInTitle')}</ThemedText>
              <ThemedText style={styles.meta}>{t('account.signInBody')}</ThemedText>
            </View>
            <View style={[styles.chip, styles.chipCyan]}>
              <ThemedText style={[styles.chipText, { color: AccountColors.onCyan }]}>{t('account.signIn')}</ThemedText>
            </View>
          </Pressable>
        )}
        {user && <ThemedText style={styles.hint}>{t('account.synced')}</ThemedText>}

        {user && (isComposer || canEditAll) && (
          <>
            <View style={[styles.sectionHead, styles.gapTop]}>
              <Music2 size={18} color={Palette.amber} />
              <ThemedText style={styles.sectionTitle}>{t('creator.section')}</ThemedText>
            </View>
            <View style={styles.group}>
              {isComposer && (
                <Pressable onPress={() => openComposer(user.uid)} style={[styles.option, styles.dividerBelow]} accessibilityRole="button">
                  <View style={styles.rowStart}>
                    <UserRound size={18} color={Palette.text} />
                    <ThemedText style={styles.optionText}>{t('creator.profile')}</ThemedText>
                  </View>
                  <ChevronRight size={16} color={Palette.muted} />
                </Pressable>
              )}
              <Pressable onPress={() => openAccount('myHymns')} style={styles.option} accessibilityRole="button">
                <View style={styles.rowStart}>
                  <ListMusic size={18} color={Palette.text} />
                  <ThemedText style={styles.optionText}>{canEditAll ? t('creator.manage') : t('creator.myHymns')}</ThemedText>
                </View>
                <ChevronRight size={16} color={Palette.muted} />
              </Pressable>
            </View>
            <ThemedText style={styles.hint}>{t('creator.studioHint')}</ThemedText>
          </>
        )}
        {user && !isComposer && !canEditAll && (
          <View style={[styles.group, styles.gapTop]}>
            <Pressable onPress={() => openAccount('becomeComposer')} style={styles.option} accessibilityRole="button">
              <View style={styles.rowStart}>
                <Music2 size={18} color={Palette.cyan} />
                <ThemedText style={styles.optionText}>{t('become.row')}</ThemedText>
              </View>
              <View style={styles.rowStart}>
                {request?.status === 'pending' && <ThemedText style={styles.hint}>{t('become.pendingRow')}</ThemedText>}
                <ChevronRight size={16} color={Palette.muted} />
              </View>
            </Pressable>
          </View>
        )}

        <View style={styles.sectionHead}>
          <Headphones size={18} color={Palette.amber} />
          <ThemedText style={styles.sectionTitle}>{t('settings.playback')}</ThemedText>
        </View>
        <View style={styles.group}>
          <View style={styles.option}>
            <ThemedText style={[styles.optionText, styles.flexText]}>{t('settings.autoPlay')}</ThemedText>
            <Switch
              value={autoPlay}
              onValueChange={setAutoPlay}
              trackColor={{ false: Palette.pill, true: Palette.cyan }}
              thumbColor="#FFFFFF"
              accessibilityLabel={t('settings.autoPlay')}
            />
          </View>
        </View>
        <ThemedText style={[styles.hint, styles.gapBottom]}>{t('settings.autoPlayHint')}</ThemedText>

        <View style={styles.sectionHead}>
          <Globe size={18} color={Palette.amber} />
          <ThemedText style={styles.sectionTitle}>{t('settings.language')}</ThemedText>
        </View>
        <View style={styles.group} accessibilityRole="radiogroup">
          {[{ value: 'system' as const, label: t('settings.system') }, ...LANGUAGES].map((o, i) => {
            const on = preference === o.value;
            return (
              <Pressable
                key={o.value}
                onPress={() => setPreference(o.value)}
                style={[styles.option, i > 0 && styles.divider]}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}>
                <ThemedText style={styles.optionText}>{o.label}</ThemedText>
                {on && <Check size={20} color={Palette.cyan} strokeWidth={2.4} />}
              </Pressable>
            );
          })}
        </View>
        <ThemedText style={styles.hint}>{t('settings.languageHint')}</ThemedText>

        {user && (
          <>
            <View style={[styles.sectionHead, styles.gapTop]}>
              <UserRound size={18} color={Palette.amber} />
              <ThemedText style={styles.sectionTitle}>{t('account.section')}</ThemedText>
            </View>
            <View style={styles.group}>
              <Pressable onPress={doSignOut} style={styles.option} accessibilityRole="button">
                <View style={styles.rowStart}>
                  <LogOut size={18} color={Palette.text} />
                  <ThemedText style={styles.optionText}>{t('account.signOut')}</ThemedText>
                </View>
              </Pressable>
              <Pressable onPress={() => openAccount('delete')} style={[styles.option, styles.divider]} accessibilityRole="button">
                <View style={styles.rowStart}>
                  <Trash2 size={18} color={AccountColors.danger} />
                  <ThemedText style={[styles.optionText, { color: AccountColors.danger }]}>{t('account.delete')}</ThemedText>
                </View>
                <ChevronRight size={16} color={Palette.muted} />
              </Pressable>
            </View>
            <Message text={error} />
          </>
        )}

        <View style={[styles.sectionHead, styles.gapTop]}>
          <Info size={18} color={Palette.amber} />
          <ThemedText style={styles.sectionTitle}>{t('settings.about')}</ThemedText>
        </View>
        <View style={styles.group}>
          <View style={styles.option}>
            <ThemedText style={styles.optionText}>Exalto</ThemedText>
            <ThemedText style={styles.hint}>{t('settings.version', { version })}</ThemedText>
          </View>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  flex: { flex: 1 },
  done: { color: Palette.cyan, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  content: { paddingHorizontal: 22, paddingBottom: Spacing.five, gap: Spacing.two },
  accountCard: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: Spacing.one },
  guestAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: Palette.surface2 },
  name: { color: Palette.text, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  meta: { color: Palette.muted, fontSize: 13, lineHeight: 18 },
  chip: { borderWidth: 1, borderColor: Palette.line, borderRadius: 999, paddingHorizontal: 12, height: 30, alignItems: 'center', justifyContent: 'center' },
  chipCyan: { backgroundColor: Palette.cyan, borderColor: Palette.cyan },
  chipText: { color: Palette.text, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  gapTop: { marginTop: Spacing.four },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.two },
  sectionTitle: { color: Palette.text, fontSize: 15, lineHeight: 20, fontWeight: '700' },
  group: { backgroundColor: Palette.surface, borderRadius: 14, borderWidth: 1, borderColor: Palette.line },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: Spacing.three },
  rowStart: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  divider: { borderTopWidth: 1, borderTopColor: Palette.line },
  dividerBelow: { borderBottomWidth: 1, borderBottomColor: Palette.line },
  optionText: { color: Palette.text, fontSize: 16, lineHeight: 22, fontWeight: '500' },
  hint: { color: Palette.muted, fontSize: 13, lineHeight: 18 },
  flexText: { flex: 1, paddingRight: Spacing.three },
  gapBottom: { marginBottom: Spacing.three },
});
