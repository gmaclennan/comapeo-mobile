import {useManyReceivedMapShares} from '@comapeo/core-react';
import {useEffect, useRef} from 'react';
import {isEditingScreen, isMapShareScreen} from '../lib/screenNameChecks';

export const PendingMapSharesListener = ({
  currentRouteName,
  navigateToMapShareScreen,
}: {
  currentRouteName: string | undefined;
  navigateToMapShareScreen: (shareId: string) => void;
}) => {
  const mapShares = useManyReceivedMapShares();
  const navigateRef = useRef(navigateToMapShareScreen);
  navigateRef.current = navigateToMapShareScreen;

  useEffect(() => {
    const pendingShare = mapShares.find(share => share.status === 'pending');
    if (!pendingShare || !currentRouteName) return;

    if (isMapShareScreen(currentRouteName)) return;

    if (isEditingScreen(currentRouteName)) return;

    navigateRef.current(pendingShare.shareId);
  }, [mapShares, currentRouteName]);

  return null;
};
