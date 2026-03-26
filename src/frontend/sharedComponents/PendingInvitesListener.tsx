import {useManyInvites} from '@comapeo/core-react';
import {useEffect} from 'react';
import {isEditingScreen, isInviteScreen} from '../lib/screenNameChecks';
import type {NavigationProp} from '@react-navigation/native';
import type {AppStackParamsList} from '../sharedTypes/navigation';

export const PendingInvitesListener = ({
  currentRouteName,
  navigation,
}: {
  currentRouteName: string | undefined;
  navigation: NavigationProp<AppStackParamsList>;
}) => {
  const {data: invites} = useManyInvites();

  useEffect(() => {
    const invite = invites.find(i => i.state === 'pending');
    if (!invite || !currentRouteName) return;

    // if user is already interacting with an invite, do nothing
    if (isInviteScreen(currentRouteName)) return;

    if (isEditingScreen(currentRouteName)) return;

    navigation.navigate('InviteReceived', {inviteId: invite.inviteId});
  }, [invites, currentRouteName, navigation]);
  return null;
};
