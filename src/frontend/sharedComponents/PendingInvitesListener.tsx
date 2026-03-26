import {useManyInvites} from '@comapeo/core-react';
import {useEffect, useRef} from 'react';
import {isEditingScreen, isInviteScreen} from '../lib/screenNameChecks';

export const PendingInvitesListener = ({
  currentRouteName,
  navigateToInviteScreen,
}: {
  currentRouteName: string | undefined;
  navigateToInviteScreen: (inviteId: string) => void;
}) => {
  const {data: invites} = useManyInvites();
  const navigateRef = useRef(navigateToInviteScreen);
  navigateRef.current = navigateToInviteScreen;

  useEffect(() => {
    const invite = invites.find(i => i.state === 'pending');
    if (!invite || !currentRouteName) return;

    // if user is already interacting with an invite, do nothing
    if (isInviteScreen(currentRouteName)) return;

    if (isEditingScreen(currentRouteName)) return;

    navigateRef.current(invite.inviteId);
  }, [invites, currentRouteName]);
  return null;
};
