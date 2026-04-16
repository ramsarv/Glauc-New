import React from 'react';
import { View, Text } from 'react-native';
import { AppRegistry } from 'react-native';

export default function App() {
  return (
    <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: '#00ff00', fontSize: 28, fontWeight: 'bold' }}>
        LOADING TEST ✓
      </Text>
      <Text style={{ color: '#aaa', fontSize: 14, marginTop: 12 }}>
        git pull worked — new code is running
      </Text>
    </View>
  );
}
