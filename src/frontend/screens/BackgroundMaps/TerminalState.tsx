import * as React from 'react';
import {StyleSheet, View} from 'react-native';

import {SecondaryButton} from '../../sharedComponents/Buttons';
import {IconTitleDescription} from '../../sharedComponents/IconTitleDescription';

export function TerminalState({
  icon,
  title,
  description,
  buttonText,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  buttonText: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <IconTitleDescription
          icon={icon}
          title={title}
          description={description}
        />
      </View>
      <View style={styles.buttonContainer}>
        <SecondaryButton fullSize text={buttonText} onPress={onPress} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonContainer: {
    gap: 12,
    alignItems: 'center',
  },
});
