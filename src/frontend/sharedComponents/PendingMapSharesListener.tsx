import {useManyReceivedMapShares} from '@comapeo/core-react';
import {useEffect} from 'react';
import {isEditingScreen, isMapShareScreen} from '../lib/screenNameChecks';
import type {NavigationProp} from '@react-navigation/native';
import type {AppStackParamsList} from '../sharedTypes/navigation';

export const PendingMapSharesListener = ({
  currentRouteName,
  navigation,
}: {
  currentRouteName: string | undefined;
  navigation: NavigationProp<AppStackParamsList>;
}) => {
  const mapShares = useManyReceivedMapShares();

  useEffect(() => {
    const pendingShare = mapShares.find(share => share.status === 'pending');
    if (!pendingShare || !currentRouteName) return;

    if (isMapShareScreen(currentRouteName)) return;

    if (isEditingScreen(currentRouteName)) return;

    navigation.navigate('MapReceivedBottomSheet', {
      shareId: pendingShare.shareId,
    });
  }, [mapShares, currentRouteName, navigation]);

  return null;
};
