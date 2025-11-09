// Simple Android-only notification helpers
// Use ToastAndroid for non-intrusive success/info messages
// Use Alert for actionable errors/confirmations

import { Alert, Platform, ToastAndroid } from 'react-native';

export const showSuccess = (message, options = {}) => {
    if (Platform.OS === 'android') {
        ToastAndroid.show(message, options.duration || ToastAndroid.SHORT);
    } else {
        Alert.alert('Success', message);
    }
};

export const showInfo = (message, options = {}) => {
    if (Platform.OS === 'android') {
        ToastAndroid.show(message, options.duration || ToastAndroid.SHORT);
    } else {
        Alert.alert('Info', message);
    }
};

export const showError = (message, title = 'Error') => {
    // Keep errors more prominent
    Alert.alert(title, message);
};

export const confirm = (title, message, actions) => {
    // Thin wrapper to centralize confirmations
    Alert.alert(title, message, actions);
};
