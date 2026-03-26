import * as React from 'react';
import {StyleSheet, View, Pressable} from 'react-native';
import {defineMessages, useIntl} from 'react-intl';
import MaterialIcon from '@react-native-vector-icons/material-icons';
import * as Sentry from '@sentry/react-native';
import {useKeepAwake} from 'expo-keep-awake';

import {
  useAbortReceivedMapShareDownload,
  useDeclineReceivedMapShare,
  useDownloadReceivedMapShare,
  useGetCustomMapInfo,
  useSingleReceivedMapShare,
} from '@comapeo/core-react';
import StackSvg from '../../images/Stack.svg';
import SuccessIcon from '../../images/Success.svg';
import ErrorIcon from '../../images/Error.svg';
import {HeaderText} from '../../sharedComponents/Text/HeaderText';
import {type NativeRootNavigationProps} from '../../sharedTypes/navigation';
import {usePreventAndroidBackButton} from '../../hooks/usePreventAndroidBackButton';
import {
  SecondaryButton,
  DestructiveButton,
} from '../../sharedComponents/Buttons';
import {IconTitleDescription} from '../../sharedComponents/IconTitleDescription';
import {TerminalState} from './TerminalState';
import {ReceivingMapProgressBar} from './ReceivingMapProgressBar';
import {
  VERY_LIGHT_GREY,
  RED,
  NEW_DARK_GREY,
  COMAPEO_BLUE,
} from '../../lib/styles';

const m = defineMessages({
  replaceMapTitle: {
    id: 'screens.Settings.MapManagement.ReplaceBackgroundMap.replaceMapTitle',
    defaultMessage: 'Replace current background map?',
  },
  replaceMapDescription: {
    id: 'screens.Settings.MapManagement.ReplaceBackgroundMap.replaceMapDescription',
    defaultMessage:
      'This device has a background map that will be replaced if you continue.',
  },
  yesReplace: {
    id: 'screens.Settings.MapManagement.ReplaceBackgroundMap.yesReplace',
    defaultMessage: 'Yes, Replace',
  },
  updating: {
    id: 'screens.Settings.MapManagement.UpdatingBackgroundMap.updating',
    defaultMessage: 'Updating...',
  },
  cancel: {
    id: 'screens.Settings.MapManagement.UpdatingBackgroundMap.cancel',
    defaultMessage: 'Cancel',
  },
  mapUpdated: {
    id: 'screens.Settings.MapManagement.BackgroundMapUpdated.mapUpdated',
    defaultMessage: 'Background map updated.',
  },
  done: {
    id: 'screens.Settings.MapManagement.BackgroundMapUpdated.done',
    defaultMessage: 'Done',
  },
  sharingCanceled: {
    id: 'screens.Settings.MapManagement.MapShareCanceled.title',
    defaultMessage: 'Sharing Canceled',
  },
  canceledMessage: {
    id: 'screens.Settings.MapManagement.MapShareCanceled.message',
    defaultMessage: 'Collaborator canceled sharing before completing.',
  },
  close: {
    id: 'screens.Settings.MapManagement.MapShareCanceled.close',
    defaultMessage: 'Close',
  },
  somethingWrong: {
    id: 'screens.Settings.MapManagement.ReceiveMapFlow.somethingWrong',
    defaultMessage: 'Something Went Wrong',
  },
  goBack: {
    id: 'screens.Settings.MapManagement.ReceiveMapFlow.goBack',
    defaultMessage: 'Go Back',
  },
});

export function ReceiveMapFlow({
  route,
  navigation,
}: NativeRootNavigationProps<'ReceiveMapFlow'>) {
  const {formatMessage: t} = useIntl();
  const {shareId} = route.params;
  const mapShare = useSingleReceivedMapShare({shareId});
  const {data: customMapInfo, error: customMapError} = useGetCustomMapInfo();
  const {mutate: downloadMapShare} = useDownloadReceivedMapShare();
  const {mutate: declineMapShare} = useDeclineReceivedMapShare();
  const {mutate: abortDownload} = useAbortReceivedMapShareDownload();

  const hasExistingMap = !!customMapInfo && !customMapError;
  const [needsReplaceConfirmation, setNeedsReplaceConfirmation] =
    React.useState(hasExistingMap);

  usePreventAndroidBackButton();
  useKeepAwake();

  const startDownload = () => {
    downloadMapShare(
      {shareId},
      {
        onError: (err: unknown) => {
          Sentry.captureException(err);
        },
      },
    );
  };

  // Start download automatically when there's no existing map to replace
  React.useEffect(() => {
    if (needsReplaceConfirmation) return;
    if (mapShare.status !== 'pending') return;
    startDownload();
  }, [needsReplaceConfirmation, mapShare.status]);

  const handleDone = () => {
    navigation.popTo('BackgroundMaps');
  };

  const handleReplace = () => {
    setNeedsReplaceConfirmation(false);
    startDownload();
  };

  const handleDeclineReplace = () => {
    declineMapShare(
      {shareId, reason: 'user_rejected'},
      {
        onSuccess: () => navigation.popTo('BackgroundMaps'),
        onError: (err: unknown) => {
          Sentry.captureException(err);
          navigation.popTo('BackgroundMaps');
        },
      },
    );
  };

  const handleCancelDownload = () => {
    abortDownload(
      {shareId},
      {
        onSuccess: () => navigation.popTo('BackgroundMaps'),
        onError: (err: unknown) => {
          Sentry.captureException(err);
          navigation.popTo('BackgroundMaps');
        },
      },
    );
  };

  // Terminal states
  if (mapShare.status === 'canceled' || mapShare.status === 'aborted') {
    return (
      <TerminalState
        icon={<ErrorIcon width={100} height={100} />}
        title={t(m.sharingCanceled)}
        description={t(m.canceledMessage)}
        buttonText={t(m.close)}
        onPress={handleDone}
      />
    );
  }

  if (mapShare.status === 'error') {
    return (
      <TerminalState
        icon={<ErrorIcon width={100} height={100} />}
        title={t(m.somethingWrong)}
        buttonText={t(m.goBack)}
        onPress={handleDone}
      />
    );
  }

  if (mapShare.status === 'completed') {
    return (
      <TerminalState
        icon={<SuccessIcon />}
        title={t(m.mapUpdated)}
        buttonText={t(m.done)}
        onPress={handleDone}
      />
    );
  }

  if (needsReplaceConfirmation) {
    return (
      <ReplaceConfirmation
        onReplace={handleReplace}
        onCancel={handleDeclineReplace}
      />
    );
  }

  return <Downloading shareId={shareId} onCancel={handleCancelDownload} />;
}

function ReplaceConfirmation({
  onReplace,
  onCancel,
}: {
  onReplace: () => void;
  onCancel: () => void;
}) {
  const {formatMessage: t} = useIntl();

  const icon = (
    <View>
      <View style={styles.iconBackground}>
        <StackSvg width={47} height={50} color={NEW_DARK_GREY} />
      </View>
      <View style={styles.warningBadge}>
        <MaterialIcon name="error" size={30} color={RED} />
      </View>
    </View>
  );

  return (
    <View style={styles.replaceContainer}>
      <View style={styles.replaceContent}>
        <IconTitleDescription
          icon={icon}
          title={t(m.replaceMapTitle)}
          description={t(m.replaceMapDescription)}
        />
      </View>
      <View style={styles.buttonContainer}>
        <DestructiveButton
          fullSize
          text={t(m.yesReplace)}
          onPress={onReplace}
          renderIcon={({color, size}) => (
            <StackSvg width={size * 0.75} height={size * 0.8} color={color} />
          )}
        />
        <SecondaryButton fullSize text={t(m.cancel)} onPress={onCancel} />
      </View>
    </View>
  );
}

function Downloading({
  shareId,
  onCancel,
}: {
  shareId: string;
  onCancel: () => void;
}) {
  const {formatMessage: t} = useIntl();

  return (
    <View style={styles.downloadingContainer}>
      <View style={styles.topSection}>
        <View style={styles.iconBackground}>
          <StackSvg width={47} height={50} color={NEW_DARK_GREY} />
        </View>
        <HeaderText variant="header2">{t(m.updating)}</HeaderText>
        <View style={styles.progressContainer}>
          <MaterialIcon
            name="sync"
            size={24}
            color={COMAPEO_BLUE}
            style={styles.syncIcon}
          />
          <ReceivingMapProgressBar shareId={shareId} />
        </View>
      </View>
      <Pressable hitSlop={20} onPress={onCancel} style={styles.cancelButton}>
        <HeaderText variant="header4" style={styles.cancelText}>
          {t(m.cancel)}
        </HeaderText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  replaceContainer: {
    flex: 1,
    paddingHorizontal: 40,
    paddingVertical: 20,
  },
  replaceContent: {
    flex: 1,
    justifyContent: 'center',
  },
  downloadingContainer: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
  },
  topSection: {
    alignItems: 'center',
    gap: 20,
    marginTop: 120,
  },
  iconBackground: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: VERY_LIGHT_GREY,
    justifyContent: 'center',
    alignItems: 'center',
  },
  warningBadge: {
    position: 'absolute',
    right: -5,
    bottom: -5,
  },
  progressContainer: {
    gap: 15,
  },
  syncIcon: {
    alignSelf: 'flex-start',
  },
  cancelButton: {
    marginTop: 80,
  },
  cancelText: {
    color: COMAPEO_BLUE,
  },
  buttonContainer: {
    gap: 12,
    alignItems: 'center',
  },
});
