import * as React from 'react';
import {AppState, StyleSheet, View, Pressable} from 'react-native';
import {defineMessages, useIntl} from 'react-intl';
import * as Sentry from '@sentry/react-native';
import MaterialIcon from '@react-native-vector-icons/material-icons';
import {useKeepAwake} from 'expo-keep-awake';

import {
  useCancelSentMapShare,
  useSingleSentMapShare,
} from '@comapeo/core-react';
import SendingIcon from '../../images/SendingIcon.svg';
import StackSvg from '../../images/Stack.svg';
import SuccessIcon from '../../images/Success.svg';
import ErrorIcon from '../../images/Error.svg';
import {usePreventAndroidBackButton} from '../../hooks/usePreventAndroidBackButton';
import {HeaderText} from '../../sharedComponents/Text/HeaderText';
import {BodyText} from '../../sharedComponents/Text/BodyText';
import {type NativeRootNavigationProps} from '../../sharedTypes/navigation';
import {TextButton} from '../../sharedComponents/TextButton';
import {SecondaryButton} from '../../sharedComponents/Buttons';
import {TerminalState} from './TerminalState';
import {SendingMapProgressBar} from './SendingMapProgressBar';
import {
  VERY_LIGHT_GREY,
  RED,
  NEW_DARK_GREY,
  BLACK,
  COMAPEO_BLUE,
} from '../../lib/styles';
import {useCurrentTime} from '../../hooks/useCurrentTime';

const m = defineMessages({
  waitingMessage: {
    id: 'screens.Settings.MapManagement.SendingBackgroundMap.waitingMessage',
    defaultMessage: 'Waiting for Device to Accept Map',
  },
  timerMessage: {
    id: 'screens.Settings.MapManagement.SendingBackgroundMap.timerMessage',
    defaultMessage: 'Map sent {time}s ago',
  },
  cancel: {
    id: 'screens.Settings.MapManagement.SendingBackgroundMap.cancel',
    defaultMessage: 'Cancel',
  },
  mapDeclined: {
    id: 'screens.Settings.MapManagement.SendingBackgroundMap.mapDeclined',
    defaultMessage: 'Map declined.',
  },
  deviceNoSpace: {
    id: 'screens.Settings.MapManagement.SendingBackgroundMap.deviceNoSpace',
    defaultMessage: 'Device does not have enough space.',
  },
  close: {
    id: 'screens.Settings.MapManagement.SendingBackgroundMap.close',
    defaultMessage: 'Close',
  },
  sending: {
    id: 'screens.Settings.MapManagement.SendingBackgroundMap.sending',
    defaultMessage: 'Sending...',
  },
  mapSent: {
    id: 'screens.Settings.MapManagement.SendingBackgroundMap.mapSent',
    defaultMessage: 'Map sent!',
  },
  done: {
    id: 'screens.Settings.MapManagement.SendingBackgroundMap.done',
    defaultMessage: 'Done',
  },
  sharingCanceled: {
    id: 'screens.Settings.MapManagement.SendingBackgroundMap.sharingCanceled',
    defaultMessage: 'Sharing Canceled',
  },
  canceledMessage: {
    id: 'screens.Settings.MapManagement.SendingBackgroundMap.canceledMessage',
    defaultMessage: 'Collaborator canceled sharing before completing.',
  },
  somethingWrong: {
    id: 'screens.Settings.MapManagement.SendingBackgroundMap.somethingWrong',
    defaultMessage: 'Something Went Wrong',
  },
  goBack: {
    id: 'screens.Settings.MapManagement.SendingBackgroundMap.goBack',
    defaultMessage: 'Go Back',
  },
});

export function SendingBackgroundMap({
  route,
  navigation,
}: NativeRootNavigationProps<'SendingBackgroundMap'>) {
  const {formatMessage: t} = useIntl();
  const {shareId} = route.params;

  const mapShare = useSingleSentMapShare({shareId});
  const {mutate: cancelMapShare} = useCancelSentMapShare();

  usePreventAndroidBackButton();
  useKeepAwake();

  const cancelShare = React.useCallback(() => {
    cancelMapShare(
      {shareId},
      {
        onSuccess: () => {
          navigation.goBack();
        },
        onError: (err: Error) => {
          Sentry.captureException(err);
          navigation.popTo('BackgroundMaps');
        },
      },
    );
  }, [navigation, cancelMapShare, shareId]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'background') {
        cancelShare();
      }
    });

    return () => subscription.remove();
  }, [cancelShare]);

  const handleClose = () => {
    navigation.popTo('BackgroundMaps');
  };

  if (!mapShare) {
    return (
      <TerminalState
        icon={<ErrorIcon width={100} height={100} />}
        title={t(m.somethingWrong)}
        buttonText={t(m.goBack)}
        onPress={handleClose}
      />
    );
  }

  // Terminal states
  if (mapShare.status === 'aborted') {
    return (
      <TerminalState
        icon={<ErrorIcon width={100} height={100} />}
        title={t(m.sharingCanceled)}
        description={t(m.canceledMessage)}
        buttonText={t(m.close)}
        onPress={handleClose}
      />
    );
  }

  if (mapShare.status === 'error') {
    return (
      <TerminalState
        icon={<ErrorIcon width={100} height={100} />}
        title={t(m.somethingWrong)}
        buttonText={t(m.goBack)}
        onPress={handleClose}
      />
    );
  }

  if (mapShare.status === 'declined') {
    const reason = (mapShare as {reason?: string}).reason;
    return <MapDeclined reason={reason} onClose={handleClose} />;
  }

  if (mapShare.status === 'completed') {
    return (
      <TerminalState
        icon={<SuccessIcon />}
        title={t(m.mapSent)}
        buttonText={t(m.done)}
        onPress={handleClose}
      />
    );
  }

  if (mapShare.status === 'downloading') {
    return <SendingMap shareId={shareId} onCancel={cancelShare} />;
  }

  return (
    <WaitingForAccept
      createdAt={mapShare.mapShareCreatedAt}
      onCancel={cancelShare}
    />
  );
}

function WaitingForAccept({
  createdAt,
  onCancel,
}: {
  createdAt: number;
  onCancel: () => void;
}) {
  const {formatMessage: t} = useIntl();
  const currentTime = useCurrentTime(1000);

  const elapsedSeconds = Math.floor(
    (currentTime.getTime() - createdAt) / 1000,
  );

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const formatted = `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;

  return (
    <View style={styles.container}>
      <SendingIcon />
      <HeaderText style={{marginTop: 10, textAlign: 'center'}}>
        {t(m.waitingMessage)}
      </HeaderText>
      <BodyText style={{marginTop: 20}}>
        {t(m.timerMessage, {time: formatted})}
      </BodyText>
      <TextButton title={t(m.cancel)} onPress={onCancel} />
    </View>
  );
}

function MapDeclined({
  reason,
  onClose,
}: {
  reason?: string;
  onClose: () => void;
}) {
  const {formatMessage: t} = useIntl();
  const isDiskSpaceIssue = reason === 'disk_full';
  const headerText = isDiskSpaceIssue ? t(m.deviceNoSpace) : t(m.mapDeclined);

  return (
    <View style={styles.baseContainer}>
      <View style={styles.centeredContent}>
        <View>
          <View style={styles.iconBackground}>
            <StackSvg width={47} height={50} color={NEW_DARK_GREY} />
          </View>
          <View style={styles.warningBadge}>
            <MaterialIcon name="error" size={30} color={RED} />
          </View>
        </View>

        <HeaderText variant="header2" style={styles.declinedHeaderText}>
          {headerText}
        </HeaderText>
      </View>

      <View style={styles.buttonContainer}>
        <SecondaryButton fullSize text={t(m.close)} onPress={onClose} />
      </View>
    </View>
  );
}

function SendingMap({
  shareId,
  onCancel,
}: {
  shareId: string;
  onCancel: () => void;
}) {
  const {formatMessage: t} = useIntl();

  return (
    <View style={[styles.baseContainer, {alignItems: 'center'}]}>
      <View style={styles.sendingTopSection}>
        <View style={styles.iconBackground}>
          <StackSvg width={47} height={50} color={NEW_DARK_GREY} />
        </View>

        <HeaderText variant="header2">{t(m.sending)}</HeaderText>

        <View style={styles.progressContainer}>
          <MaterialIcon
            name="sync"
            size={24}
            color={COMAPEO_BLUE}
            style={styles.syncIcon}
          />
          <SendingMapProgressBar shareId={shareId} />
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
  baseContainer: {
    flex: 1,
    padding: 20,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 35,
  },
  centeredContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 30,
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
  declinedHeaderText: {
    textAlign: 'center',
    color: BLACK,
  },
  sendingTopSection: {
    alignItems: 'center',
    gap: 20,
    marginTop: 120,
  },
  progressContainer: {
    gap: 15,
  },
  syncIcon: {
    alignSelf: 'flex-start',
  },
  buttonContainer: {
    alignItems: 'center',
  },
  cancelButton: {
    marginTop: 80,
  },
  cancelText: {
    color: COMAPEO_BLUE,
  },
});
